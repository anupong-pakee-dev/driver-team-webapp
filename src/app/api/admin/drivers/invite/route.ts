import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { driverInviteLink } from "@/lib/links";
import { createInvite } from "@/services/drivers";

// FR-DRV-01: owner เพิ่มคนขับ → ลิงก์เชิญใช้ครั้งเดียว 72 ชม. (ไม่เปิดสมัครสาธารณะ)
const Body = z.strictObject({
  nickname: z.string().trim().min(1).max(50),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
});

export async function POST(req: NextRequest) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    const inv = await createInvite(owner, { nickname: b.nickname, fullName: b.full_name, phone: b.phone });
    return NextResponse.json(
      { driver_id: inv.userId, link: driverInviteLink(req.nextUrl.origin, inv.token), expires_in_hours: inv.ttlHours },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
