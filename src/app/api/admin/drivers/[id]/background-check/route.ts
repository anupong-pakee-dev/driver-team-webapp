import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { recordBackgroundCheck } from "@/services/drivers";

// FR-DRV-05: เฉพาะ owner · เก็บแค่วันที่ + ผล
const Body = z.strictObject({ at: z.iso.date(), passed: z.boolean() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/drivers/[id]/background-check">) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    await recordBackgroundCheck(owner, (await ctx.params).id, b.at, b.passed);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
