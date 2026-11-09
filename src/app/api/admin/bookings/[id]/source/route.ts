import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";

// FR-ADS-03 แท็กที่มาด้วยมือ (ลูกค้าทักตรงไม่ผ่านลิงก์)
const Body = z.strictObject({
  source_platform: z.enum(["meta", "google", "tiktok", "gbp", "offline", "referral", "direct", "unknown"]),
  campaign_id: z.uuid().nullable(),
});

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/admin/bookings/[id]/source">) {
  try {
    const user = await requireUser(["sales_admin", "owner"]);
    const b = Body.parse(await req.json());
    await withTx({ userId: user.id, role: user.role, reason: "tag booking source" }, async (db) => {
      const { rowCount } = await db.query(`update bookings set source_platform = $2, campaign_id = $3 where id = $1`,
        [(await ctx.params).id, b.source_platform, b.campaign_id]);
      if (!rowCount) throw new BizError("NOT_FOUND");
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
