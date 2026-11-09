import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { rejectOffer } from "@/services/dispatch";

// FR-DISP-02 ปฏิเสธ (ใส่เหตุผล) → เสนอคนถัดไปทันที
const Body = z.strictObject({ reason: z.string().trim().min(2).max(200) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/offers/[id]/reject">) {
  try {
    const driver = await requireUser(["driver"]);
    const b = Body.parse(await req.json());
    return NextResponse.json(await rejectOffer(driver, (await ctx.params).id, b.reason));
  } catch (e) {
    return errorResponse(e);
  }
}
