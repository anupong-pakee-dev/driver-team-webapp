import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { driverCancel } from "@/services/dispatch";

// §6.1 assigned → confirmed (คนขับยกเลิก) → เสนอคนสำรองทันที
const Body = z.strictObject({ reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/driver-cancel">) {
  try {
    const driver = await requireUser(["driver"]);
    return NextResponse.json(await driverCancel(driver, (await ctx.params).id, Body.parse(await req.json()).reason));
  } catch (e) {
    return errorResponse(e);
  }
}
