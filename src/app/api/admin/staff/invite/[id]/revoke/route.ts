import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { revokeStaffInvite } from "@/services/staff";

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/admin/staff/invite/[id]/revoke">) {
  try {
    const owner = await requireUser(["owner"]);
    const id = z.uuid().parse((await ctx.params).id);
    await revokeStaffInvite(owner, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
