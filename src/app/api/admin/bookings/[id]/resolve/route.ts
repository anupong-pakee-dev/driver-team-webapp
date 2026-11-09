import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { resolveDispute } from "@/services/trip";

// disputed → completed (owner) พร้อมผลการแก้ไข
const Body = z.strictObject({ resolution: z.string().trim().min(3).max(1000) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/bookings/[id]/resolve">) {
  try {
    const owner = await requireUser(["owner"]);
    return NextResponse.json(await resolveDispute(owner, (await ctx.params).id, Body.parse(await req.json()).resolution));
  } catch (e) {
    return errorResponse(e);
  }
}
