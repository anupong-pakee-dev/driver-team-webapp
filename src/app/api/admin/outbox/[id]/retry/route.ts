import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";

// §14 ส่งข้อความที่ค้าง/ล้มเหลวอีกครั้ง (หลังแก้ปัญหา เช่น ต่ออายุ token LINE)
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/admin/outbox/[id]/retry">) {
  try {
    await requireUser(["sales_admin", "owner"]);
    const { rowCount } = await pool.query(
      `update outbox set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null
        where id = $1 and status in ('failed','dead')`, [(await ctx.params).id]);
    if (!rowCount) throw new BizError("INVALID_TRANSITION");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
