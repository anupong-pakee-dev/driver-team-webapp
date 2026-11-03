import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { overrideAssign } from "@/services/dispatch";

// FR-DISP-03 / BR-DISP-05: owner เลือกคนขับเอง (เหตุผลบังคับ · ต้อง eligible)
const Body = z.strictObject({ driver_id: z.uuid(), vehicle_id: z.uuid().nullable(), reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/bookings/[id]/override-assign">) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    return NextResponse.json(await overrideAssign(owner, (await ctx.params).id, b.driver_id, b.vehicle_id, b.reason));
  } catch (e) {
    return errorResponse(e);
  }
}
