import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { confirmNoShow } from "@/services/trip";

// §8.2 POST /api/admin/bookings/{id}/no-show (confirm) — owner ยืนยันหลังคนขับรายงานพร้อมรูป
const Body = z.strictObject({ reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/bookings/[id]/no-show">) {
  try {
    const owner = await requireUser(["owner"]);
    return NextResponse.json(await confirmNoShow(owner, (await ctx.params).id, Body.parse(await req.json()).reason));
  } catch (e) {
    return errorResponse(e);
  }
}
