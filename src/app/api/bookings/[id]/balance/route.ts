import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { openBalance } from "@/services/bookings";

// FR-PAY-04 เปิด QR ยอดคงเหลือ
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/balance">) {
  try {
    const user = await requireUser(["customer", "corporate_customer", "sales_admin", "owner"]);
    return NextResponse.json(await openBalance(user, (await ctx.params).id), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
