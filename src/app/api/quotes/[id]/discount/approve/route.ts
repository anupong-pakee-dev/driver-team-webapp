import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { decideDiscount } from "@/services/quotes";

// BR-PRICE-02: owner อนุมัติ/ไม่อนุมัติส่วนลดที่เกินเพดาน
const Body = z.strictObject({ approve: z.boolean(), reason: z.string().trim().max(300).optional() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/quotes/[id]/discount/approve">) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    return NextResponse.json(await decideDiscount(owner, (await ctx.params).id, b.approve, b.reason));
  } catch (e) {
    return errorResponse(e);
  }
}
