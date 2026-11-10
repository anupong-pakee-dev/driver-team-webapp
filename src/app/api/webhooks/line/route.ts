import { NextResponse, type NextRequest } from "next/server";
import { reply, verifySignature } from "@/adapters/line/messaging";
import type { SessionUser } from "@/lib/auth";
import { pool, SYSTEM, withTx } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { log } from "@/lib/redact";
import { acceptOffer, rejectOffer } from "@/services/dispatch";

// §9.1 LINE webhook: ตรวจลายเซ็นก่อน · ตอบ 200 เร็ว
// follow / message → สร้างบัญชีลูกค้าจาก LINE user id · postback "offer:accept|reject:<id>" → รับ/ปฏิเสธงาน (FR-DISP-02)

type LineEvent = {
  type: string;
  replyToken?: string;
  source?: { type: string; userId?: string };
  postback?: { data?: string };
};

const OFFER_TH: Record<string, string> = {
  OFFER_EXPIRED: "ข้อเสนอนี้หมดเวลาแล้ว",
  OFFER_ACCEPTED: "รับงานนี้ไปแล้ว",
  OFFER_REJECTED: "ปฏิเสธงานนี้ไปแล้ว",
  OFFER_WITHDRAWN: "งานนี้ถูกยกเลิก/มอบให้คนอื่นแล้ว",
  OFFER_TAKEN: "งานนี้มีคนรับไปแล้ว — รอข้อเสนองานถัดไปได้เลย",
  TIME_CONFLICT: "เวลาชนกับงานอื่นหรือช่วงที่ปิดไว้",
};

async function handlePostback(e: LineEvent) {
  const m = /^offer:(accept|reject):([0-9a-f-]{36})$/.exec(e.postback?.data ?? "");
  if (!m || !e.source?.userId) return;
  const { rows } = await pool.query(
    `select id, auth_user_id, role, display_name, locale from users where line_user_id = $1 and status = 'active' and role = 'driver'`,
    [e.source.userId]);
  if (!rows[0]) return;
  const driver: SessionUser = { id: rows[0].id, authUserId: rows[0].auth_user_id, role: "driver", displayName: rows[0].display_name, locale: rows[0].locale };
  let text: string;
  try {
    if (m[1] === "accept") {
      await acceptOffer(driver, m[2]);
      text = "รับงานแล้ว ✓ ดูรายละเอียดในแอป";
    } else {
      await rejectOffer(driver, m[2], "ปฏิเสธผ่าน LINE");
      text = "ปฏิเสธงานแล้ว";
    }
  } catch (err) {
    const reason = err instanceof BizError ? String(err.details.reason ?? err.code) : "ERROR";
    text = err instanceof BizError && err.code === "NOT_ELIGIBLE"
      ? "รับงานนี้ไม่ได้: เอกสาร/รถไม่ผ่านเกณฑ์ ณ วันงาน — ติดต่อเจ้าของ"
      : OFFER_TH[reason] ?? "ทำรายการไม่สำเร็จ ลองในแอป";
  }
  if (e.replyToken && process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    // ตอบทันทีด้วย reply (ไม่นับโควตา) — reply token มีอายุสั้น จึงไม่ผ่าน outbox
    await reply(e.replyToken, [{ type: "text", text }]).catch((x) => log.warn("line reply failed", { error: (x as Error).message }));
  }
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifySignature(raw, req.headers.get("x-line-signature"))) {
    log.warn("line webhook bad signature");
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }
  let events: LineEvent[] = [];
  try {
    events = (JSON.parse(raw) as { events?: LineEvent[] }).events ?? [];
  } catch {
    return NextResponse.json({ ok: true });
  }
  const users = [...new Set(events
    .filter((e) => (e.type === "follow" || e.type === "message") && e.source?.type === "user" && e.source.userId)
    .map((e) => e.source!.userId!))];
  if (users.length) {
    await withTx({ ...SYSTEM, reason: "line webhook" }, async (db) => {
      for (const id of users) {
        await db.query(
          `insert into users (auth_user_id, role, line_user_id) values (gen_random_uuid(), 'customer', $1)
           on conflict (line_user_id) do nothing`,
          [id],
        );
      }
    });
  }
  for (const e of events.filter((x) => x.type === "postback")) await handlePostback(e);
  return NextResponse.json({ ok: true });
}
