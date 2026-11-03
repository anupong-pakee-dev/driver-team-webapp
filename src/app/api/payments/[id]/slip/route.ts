import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { submitSlip } from "@/services/bookings";

// §8.2 ส่งสลิป (adapter ข) — multipart file=<รูปสลิป> หรือ json { qr_payload }
// ใช้ payment id (รองรับทั้งมัดจำและยอดคงเหลือ)
export async function POST(req: NextRequest, ctx: RouteContext<"/api/payments/[id]/slip">) {
  try {
    const user = await requireUser(["customer", "corporate_customer"]);
    const { id } = await ctx.params;
    let input: { file?: File; qrPayload?: string };
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const file = (await req.formData()).get("file");
      if (!(file instanceof File)) throw new BizError("VALIDATION", { file: "required" });
      input = { file };
    } else {
      const body = (await req.json()) as { qr_payload?: unknown };
      if (typeof body.qr_payload !== "string" || body.qr_payload.length > 500) throw new BizError("VALIDATION", { qr_payload: "required" });
      input = { qrPayload: body.qr_payload };
    }
    return NextResponse.json(await submitSlip(user, id, input));
  } catch (e) {
    return errorResponse(e);
  }
}
