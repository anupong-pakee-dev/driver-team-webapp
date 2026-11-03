import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { startSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { log } from "@/lib/redact";
import { enqueue } from "@/services/outbox";

// §8.1 แอดมิน/เจ้าของ: Supabase Auth (อีเมล + รหัสผ่าน) · 2FA ของ owner ❓ T7
// §13.1 บัญชี owner ถูกยึด: จำกัดการลองรหัส · บันทึก login ทุกครั้ง · แจ้งเตือน login จากอุปกรณ์ใหม่

const Body = z.strictObject({ email: z.email(), password: z.string().min(8).max(200) });

async function audit(action: string, userId: string | null, meta: Record<string, unknown>) {
  await pool.query(
    `insert into audit_logs (actor_id, actor_role, action, entity, entity_id, after) values ($1, 'auth', $2, 'users', $1, $3)`,
    [userId, action, meta]).catch(() => {});
}

export async function POST(req: NextRequest) {
  try {
    const body = Body.parse(await req.json());
    const ip = clientIp(req);
    const emailKey = createHash("sha256").update(body.email.toLowerCase()).digest("hex").slice(0, 16);
    // ต่อ IP และต่อบัญชี: 10 ครั้ง / 15 นาที
    await rateLimit(`admin-login:ip:${ip}`, 10, 900);
    await rateLimit(`admin-login:acct:${emailKey}`, 10, 900);

    const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase.auth.signInWithPassword(body);
    const device = createHash("sha256").update(req.headers.get("user-agent") ?? "").digest("hex").slice(0, 16);
    if (error || !data.user) {
      await audit("LOGIN_FAILED", null, { account: emailKey, ip_hash: createHash("sha256").update(ip).digest("hex").slice(0, 16) });
      throw new BizError("UNAUTHENTICATED");
    }

    const { rows } = await pool.query(
      `select id, role, display_name from users where auth_user_id = $1 and role in ('sales_admin','owner') and status = 'active'`,
      [data.user.id],
    );
    if (!rows[0]) {
      log.warn("admin login without staff role", { auth_user_id: data.user.id });
      throw new BizError("FORBIDDEN");
    }
    const u = rows[0];
    const seen = await pool.query(
      `select 1 from audit_logs where action = 'LOGIN' and actor_id = $1 and after->>'device' = $2 limit 1`, [u.id, device]);
    await audit("LOGIN", u.id, { device });
    if (!seen.rows[0]) {
      // อุปกรณ์ใหม่ → แจ้งเจ้าของทุกคนที่ผูก LINE
      const { rows: owners } = await pool.query(
        `select id, line_user_id from users where role = 'owner' and status = 'active' and line_user_id is not null`);
      const c = await pool.connect();
      try {
        for (const o of owners) {
          await enqueue(c, "line.push", {
            to: o.line_user_id,
            messages: [{ type: "text", text: `[ความปลอดภัย] ${u.display_name} เข้าสู่ระบบหลังบ้านจากอุปกรณ์ใหม่ — ถ้าไม่ใช่คุณ ให้เปลี่ยนรหัสผ่านทันที` }],
          }, `new-device:${u.id}:${device}:${o.id}`);
        }
      } finally {
        c.release();
      }
    }
    await startSession(u.id, "admin");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
