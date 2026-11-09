import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { markPayoutPaid } from "@/services/payouts";

// FR-PAYOUT-03 · §8.2 POST /api/admin/payouts/{id}/paid — multipart file=<หลักฐานโอน>
export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/payouts/[id]/paid">) {
  try {
    const owner = await requireUser(["owner"]);
    const file = (await req.formData()).get("file");
    if (!(file instanceof File) || !file.size) throw new BizError("VALIDATION", { file: "required" });
    return NextResponse.json(await markPayoutPaid(owner, (await ctx.params).id, file));
  } catch (e) {
    return errorResponse(e);
  }
}
