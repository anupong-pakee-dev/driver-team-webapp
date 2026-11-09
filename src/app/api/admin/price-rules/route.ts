import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { upsertPriceRule } from "@/services/quotes";

// FR-PRICE-02: owner แก้ราคา (เวอร์ชันใหม่ มีผลกับใบเสนอราคาใหม่เท่านั้น) · ทุกค่าเป็นสตางค์
const S = z.number().int().min(0).max(100_000_000);
const Body = z.strictObject({
  reason: z.string().trim().min(3).max(300),
  car_type: z.enum(["sedan", "suv", "van", "van_vip", "mpv_premium", "driver_only"]),
  service_type: z.enum(["airport_transfer", "point_to_point", "hourly_charter", "daily_charter", "driver_only"]),
  base_satang: S, per_km_satang: S, ot_per_hour_satang: S, wait_per_hour_satang: S, floor_satang: S,
  included_km: z.number().int().min(0).max(5000),
  included_minutes: z.number().int().min(0).max(10_000),
  free_wait_minutes: z.number().int().min(0).max(600),
  tax_category: z.enum(["transport", "rental", "service"]),
});

export async function PUT(req: NextRequest) {
  try {
    const owner = await requireUser(["owner"]);
    const { reason, ...rule } = Body.parse(await req.json());
    if (rule.floor_satang > rule.base_satang) throw new BizError("VALIDATION", { field: "floor_satang" });
    return NextResponse.json({ id: await upsertPriceRule(owner, rule, reason) });
  } catch (e) {
    return errorResponse(e);
  }
}
