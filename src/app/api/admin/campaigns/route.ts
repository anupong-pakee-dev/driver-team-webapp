import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { SLUG } from "@/domain/attribution";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

// FR-ADS-02 สร้าง/แก้แคมเปญ (sales_admin, owner) — ลิงก์ /go/{slug} + QR
const CampaignBody = z.strictObject({
  id: z.uuid().optional(),
  slug: z.string().regex(SLUG),
  name: z.string().trim().min(2).max(120),
  platform: z.enum(["meta", "google", "tiktok", "gbp", "offline", "referral", "direct"]),
  target: z.enum(["landing", "line_oa"]),
  service_type: z.enum(["airport_transfer", "point_to_point", "hourly_charter", "daily_charter", "driver_only"]).nullable(),
  utm_source: z.string().trim().max(60).nullable(),
  utm_medium: z.string().trim().max(60).nullable(),
  utm_campaign: z.string().trim().max(120).nullable(),
  start_at: z.iso.date().nullable(),
  end_at: z.iso.date().nullable(),
  status: z.enum(["active", "paused"]),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["sales_admin", "owner"]);
    const b = CampaignBody.parse(await req.json());
    const id = await withTx({ userId: user.id, role: user.role, reason: b.id ? "edit campaign" : "create campaign" }, async (db) => {
      const vals = [b.slug, b.platform, b.name, b.utm_source, b.utm_medium, b.utm_campaign, b.service_type, b.start_at, b.end_at, b.status, b.target];
      if (b.id) {
        const { rows } = await db.query(
          `update campaigns set slug=$1, platform=$2, name=$3, utm_source=$4, utm_medium=$5, utm_campaign=$6, service_type=$7,
                  start_at=$8, end_at=$9, status=$10, target=$11 where id = $12 returning id`, [...vals, b.id]);
        return rows[0]?.id;
      }
      const { rows } = await db.query(
        `insert into campaigns (slug, platform, name, utm_source, utm_medium, utm_campaign, service_type, start_at, end_at, status, target)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning id`, vals);
      return rows[0].id;
    });
    return NextResponse.json({ id }, { status: b.id ? 200 : 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
