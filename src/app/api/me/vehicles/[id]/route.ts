import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { updateVehicle } from "@/services/drivers";
import { VehicleBody } from "../schema";

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/me/vehicles/[id]">) {
  try {
    const user = await requireUser(["driver"]);
    const { id } = await ctx.params;
    await updateVehicle(user, id, VehicleBody.parse(await req.json()));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
