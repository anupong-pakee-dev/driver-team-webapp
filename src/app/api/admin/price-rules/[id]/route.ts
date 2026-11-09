import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { deactivatePriceRule } from "@/services/quotes";

// ปิดการขายบริการ/รถประเภทนี้ (ไม่ลบ — ใบเสนอราคาเดิมยังอ้างถึง)
const Body = z.strictObject({ reason: z.string().trim().min(3).max(300) });

export async function DELETE(req: NextRequest, ctx: RouteContext<"/api/admin/price-rules/[id]">) {
  try {
    const owner = await requireUser(["owner"]);
    const { reason } = Body.parse(await req.json());
    await deactivatePriceRule(owner, (await ctx.params).id, reason);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
