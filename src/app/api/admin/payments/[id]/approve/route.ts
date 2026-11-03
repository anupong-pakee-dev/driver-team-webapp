import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { decidePayment, requestManualApproval } from "@/services/bookings";

// FR-PAY-03: sales_admin ขออนุมัติได้ แต่ยืนยันเองไม่ได้ · owner อนุมัติ/ไม่อนุมัติ
const Body = z.strictObject({ approve: z.boolean().optional(), reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/payments/[id]/approve">) {
  try {
    const user = await requireUser(["sales_admin", "owner"]);
    const { id } = await ctx.params;
    const b = Body.parse(await req.json());
    if (user.role === "sales_admin") {
      await requestManualApproval(user, id, b.reason);
      return NextResponse.json({ status: "pending_approval" });
    }
    return NextResponse.json(await decidePayment(user, id, b.approve ?? true, b.reason));
  } catch (e) {
    return errorResponse(e);
  }
}
