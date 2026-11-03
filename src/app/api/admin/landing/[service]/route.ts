import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";
import { LANDING_CHECKS } from "@/domain/landing";
import { invalidateSettings } from "@/lib/settings";

// FR-ADS-17: เจ้าของยืนยันเช็กลิสต์ครบทุกข้อก่อนเผยแพร่ landing (บันทึกใน audit)

const Body = z.strictObject({
  publish: z.boolean(),
  checks: z.array(z.enum(LANDING_CHECKS)).optional(),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/landing/[service]">) {
  try {
    const owner = await requireUser(["owner"]);
    const service = (await ctx.params).service;
    if (!["airport_transfer", "daily_charter", "point_to_point", "hourly_charter"].includes(service)) throw new BizError("NOT_FOUND");
    const b = Body.parse(await req.json());
    if (b.publish && LANDING_CHECKS.some((c) => !b.checks?.includes(c))) throw new BizError("VALIDATION", { reason: "CHECKLIST_INCOMPLETE" });
    await withTx({ userId: owner.id, role: owner.role, reason: b.publish ? `publish landing ${service}: checklist confirmed` : `unpublish landing ${service}` }, (db) =>
      db.query(
        `update settings set value = value || jsonb_build_object($1::text, $2::jsonb), updated_by = $3, updated_at = now() where key = 'landing_published'`,
        [service, JSON.stringify(b.publish ? { at: new Date().toISOString(), by: owner.id, checks: b.checks } : false), owner.id]));
    invalidateSettings();
    return NextResponse.json({ published: b.publish });
  } catch (e) {
    return errorResponse(e);
  }
}
