import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { removeDriver } from "@/services/driverRemoval";

// เจ้าของลบคนขับ: ไม่มีประวัติงาน → ลบจริง · มีประวัติ → ลบข้อมูลส่วนตัว เก็บประวัติงาน/เงิน
const Body = z.strictObject({ reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/admin/drivers/[id]/remove">) {
  try {
    const owner = await requireUser(["owner"]);
    const id = z.uuid().parse((await ctx.params).id);
    const { reason } = Body.parse(await req.json());
    return NextResponse.json(await removeDriver(owner, id, reason));
  } catch (e) {
    return errorResponse(e);
  }
}
