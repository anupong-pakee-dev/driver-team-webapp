import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { setVehicleActive } from "@/services/drivers";

const Body = z.strictObject({ active: z.boolean(), reason: z.string().trim().min(3).max(500) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/vehicles/[id]/active">) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    await setVehicleActive(owner, (await ctx.params).id, b.active, b.reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
