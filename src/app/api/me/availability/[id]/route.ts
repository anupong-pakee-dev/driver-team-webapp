import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { removeBlock } from "@/services/drivers";

export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/me/availability/[id]">) {
  try {
    const user = await requireUser(["driver"]);
    await removeBlock(user, (await ctx.params).id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
