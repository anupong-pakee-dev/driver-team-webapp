import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";

// FR-ADMIN-03 · §8.2 POST /api/admin/users/{id}/block — owner เท่านั้น · ใส่เหตุผล
// ผู้ถูกบล็อกใช้งานไม่ได้ทันที: currentUser() ตรวจ status ทุก request และ app_role() คืน null
const Body = z.strictObject({ status: z.enum(["active", "suspended", "blocked"]), reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/users/[id]/status">) {
  try {
    const owner = await requireUser(["owner"]);
    const { id } = await ctx.params;
    const b = Body.parse(await req.json());
    if (id === owner.id) throw new BizError("VALIDATION", { reason: "CANNOT_BLOCK_SELF" });
    await withTx({ userId: owner.id, role: owner.role, reason: b.reason }, async (db) => {
      const { rowCount } = await db.query(`update users set status = $2 where id = $1 and role <> 'owner'`, [id, b.status]);
      if (!rowCount) throw new BizError("NOT_FOUND");
      // คนขับที่ถูกระงับ: ถอนข้อเสนองานที่ค้าง (งานที่รับแล้วให้ owner เปลี่ยนคนขับเอง — future_job_guard จะแจ้ง)
      if (b.status !== "active") await db.query(`update job_offers set result = 'withdrawn' where driver_id = $1 and result = 'pending'`, [id]);
    });
    return NextResponse.json({ status: b.status });
  } catch (e) {
    return errorResponse(e);
  }
}
