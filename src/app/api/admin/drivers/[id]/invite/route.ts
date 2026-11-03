import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { driverInviteLink } from "@/lib/links";
import { reissueInvite } from "@/services/drivers";

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/drivers/[id]/invite">) {
  try {
    const owner = await requireUser(["owner"]);
    const inv = await reissueInvite(owner, (await ctx.params).id);
    return NextResponse.json({ link: driverInviteLink(req.nextUrl.origin, inv.token), expires_in_hours: inv.ttlHours });
  } catch (e) {
    return errorResponse(e);
  }
}
