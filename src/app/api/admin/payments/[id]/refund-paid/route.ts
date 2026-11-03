import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { markRefundPaid } from "@/services/bookings";

// FR-PAY-05: owner โอนคืนแล้ว + แนบหลักฐาน (multipart file)
export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/payments/[id]/refund-paid">) {
  try {
    const owner = await requireUser(["owner"]);
    const file = (await req.formData()).get("file");
    if (!(file instanceof File)) throw new BizError("VALIDATION", { file: "required" });
    return NextResponse.json(await markRefundPaid(owner, (await ctx.params).id, file));
  } catch (e) {
    return errorResponse(e);
  }
}
