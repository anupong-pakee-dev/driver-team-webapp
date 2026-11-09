import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { redispatch } from "@/services/dispatch";

// เสนองานรอบใหม่ (เช่น หลังเพิ่มคนขับ/รถ หรือปิดปฏิทิน)
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/admin/bookings/[id]/redispatch">) {
  try {
    const owner = await requireUser(["owner", "sales_admin"]);
    return NextResponse.json(await redispatch(owner, (await ctx.params).id));
  } catch (e) {
    return errorResponse(e);
  }
}
