import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { complain } from "@/services/trip";

// FR-TRIP-04 ร้องเรียนภายใน 24 ชม. หลังจบ → พัก payout
const Body = z.strictObject({ description: z.string().trim().min(5).max(2000) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/complaints">) {
  try {
    const user = await requireUser(["customer", "corporate_customer"]);
    return NextResponse.json(await complain(user, (await ctx.params).id, Body.parse(await req.json()).description), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
