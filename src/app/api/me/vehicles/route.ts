import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { addVehicle } from "@/services/drivers";
import { VehicleBody } from "./schema";

// FR-VEH-01
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["driver"]);
    const id = await addVehicle(user, VehicleBody.parse(await req.json()));
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
