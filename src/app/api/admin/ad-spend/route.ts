import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

// FR-ADS-04 บันทึกค่าแอดต่อแคมเปญต่อวัน (กรอกเอง) — วันเดิมซ้ำ = แก้ยอด (ลง audit)
const Body = z.strictObject({
  date: z.iso.date(),
  platform: z.enum(["meta", "google", "tiktok", "gbp", "offline", "referral", "direct"]),
  campaign_id: z.uuid().nullable(),
  amount_satang: z.number().int().min(0).max(1_000_000_000),
  impressions: z.number().int().min(0).nullable(),
  clicks: z.number().int().min(0).nullable(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["sales_admin", "owner"]);
    const b = Body.parse(await req.json());
    await withTx({ userId: user.id, role: user.role, reason: "ad spend entry" }, async (db) => {
      const { rowCount } = await db.query(
        `update ad_spend set amount_satang = $4, impressions = $5, clicks = $6
          where date = $1 and platform = $2 and campaign_id is not distinct from $3`,
        [b.date, b.platform, b.campaign_id, b.amount_satang, b.impressions, b.clicks]);
      if (!rowCount) {
        await db.query(
          `insert into ad_spend (date, platform, campaign_id, amount_satang, impressions, clicks) values ($1,$2,$3,$4,$5,$6)`,
          [b.date, b.platform, b.campaign_id, b.amount_satang, b.impressions, b.clicks]);
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
