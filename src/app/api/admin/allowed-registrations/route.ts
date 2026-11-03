import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

// BR-COMP-05: owner เท่านั้น · กรอกตามคำตอบ ขบ. · ส่งรายการทั้งหมดมาแทนที่
const Body = z.strictObject({
  reason: z.string().trim().min(3).max(500),
  items: z.array(z.strictObject({
    service_type: z.enum(["airport_transfer", "point_to_point", "hourly_charter", "daily_charter", "driver_only"]),
    registration_type: z.string().min(1).max(40),
    note: z.string().max(300).nullable().optional(),
    confirmed_by_dlt_at: z.iso.date(),
  })).max(200),
});

export async function PUT(req: NextRequest) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    await withTx({ userId: owner.id, role: owner.role, reason: b.reason }, async (db) => {
      await db.query(`delete from allowed_registrations`);
      for (const i of b.items) {
        await db.query(
          `insert into allowed_registrations (service_type, registration_type, note, confirmed_by_dlt_at) values ($1, $2, $3, $4)`,
          [i.service_type, i.registration_type, i.note ?? null, i.confirmed_by_dlt_at],
        );
      }
    });
    return NextResponse.json({ count: b.items.length });
  } catch (e) {
    return errorResponse(e);
  }
}
