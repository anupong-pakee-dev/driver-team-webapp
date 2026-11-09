import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { reviewDocument } from "@/services/documents";

// FR-DRV-03: อนุมัติ/ปฏิเสธทีละรายการ (ปฏิเสธต้องมีเหตุผล)
const Body = z.strictObject({ approve: z.boolean(), reason: z.string().trim().min(3).max(500).optional() });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/documents/[id]/review">) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    return NextResponse.json(await reviewDocument(owner, (await ctx.params).id, b.approve, b.reason ?? null));
  } catch (e) {
    return errorResponse(e);
  }
}
