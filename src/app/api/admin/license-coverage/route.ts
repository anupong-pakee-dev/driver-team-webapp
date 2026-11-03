import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

// ใบขับขี่ประเภทไหนขับรถประเภทไหนได้ (ตาม ขบ.) — owner เท่านั้น · แทนที่ทั้งชุด
const Body = z.strictObject({
  reason: z.string().trim().min(3).max(500),
  items: z.array(z.strictObject({
    license_class: z.string().min(1).max(40),
    car_type: z.enum(["sedan", "suv", "van", "van_vip", "mpv_premium"]),
  })).max(200),
});

export async function PUT(req: NextRequest) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    await withTx({ userId: owner.id, role: owner.role, reason: b.reason }, async (db) => {
      await db.query(`delete from license_coverage`);
      for (const i of b.items) {
        await db.query(`insert into license_coverage (license_class, car_type) values ($1, $2)`, [i.license_class, i.car_type]);
      }
    });
    return NextResponse.json({ count: b.items.length });
  } catch (e) {
    return errorResponse(e);
  }
}
