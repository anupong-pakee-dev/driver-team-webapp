import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { rejectApplication } from "@/services/driverApplications";

const Body = z.strictObject({ reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/driver-applications/[id]/reject">) {
  try {
    const owner = await requireUser(["owner"]);
    const { reason } = Body.parse(await req.json());
    await rejectApplication(owner, z.uuid().parse((await ctx.params).id), reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
