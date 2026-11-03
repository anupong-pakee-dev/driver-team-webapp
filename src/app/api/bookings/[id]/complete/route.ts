import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { completeByCustomer } from "@/services/trip";

// FR-TRIP-03 ลูกค้ายืนยันจบงาน + คะแนน
const Body = z.strictObject({
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().max(1000).nullable().optional(),
  consent_marketing: z.boolean().default(false),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/complete">) {
  try {
    const user = await requireUser(["customer", "corporate_customer"]);
    return NextResponse.json(await completeByCustomer(user, (await ctx.params).id, Body.parse(await req.json())));
  } catch (e) {
    return errorResponse(e);
  }
}
