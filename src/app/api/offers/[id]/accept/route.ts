import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { acceptOffer } from "@/services/dispatch";

// §8.2 POST /api/offers/{id}/accept — คนขับ · 409 OFFER_EXPIRED | TIME_CONFLICT · 422 NOT_ELIGIBLE
const Body = z.strictObject({ vehicle_id: z.uuid().nullable().optional() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/offers/[id]/accept">) {
  try {
    const driver = await requireUser(["driver"]);
    const b = Body.parse(await req.json().catch(() => ({})));
    return NextResponse.json(await acceptOffer(driver, (await ctx.params).id, b.vehicle_id));
  } catch (e) {
    return errorResponse(e);
  }
}
