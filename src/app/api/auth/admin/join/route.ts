import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { startSession } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { redeemStaffInvite } from "@/services/staff";

// ผู้ได้รับเชิญเป็นแอดมินตั้งรหัสผ่าน → สร้างบัญชี + เข้าสู่ระบบหลังบ้านทันที
const Body = z.strictObject({
  token: z.string().min(20).max(100),
  password: z.string().min(10).max(200),
});

export async function POST(req: NextRequest) {
  try {
    await rateLimit(`staff-join:${clientIp(req)}`, 10, 900);
    const b = Body.parse(await req.json());
    const userId = await redeemStaffInvite(b.token, b.password);
    await startSession(userId, "admin");
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
