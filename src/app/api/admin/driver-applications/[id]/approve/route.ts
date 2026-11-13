import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { approveApplication } from "@/services/driverApplications";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/admin/driver-applications/[id]/approve">) {
  try {
    const owner = await requireUser(["owner"]);
    return NextResponse.json(await approveApplication(owner, z.uuid().parse((await ctx.params).id)));
  } catch (e) {
    return errorResponse(e);
  }
}
