import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { identifyLine } from "@/lib/lineIdentity";
import { errorResponse } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { submitApplication } from "@/services/driverApplications";

// สมัครเป็นคนขับ (จาก QR สาธารณะ) — ต้องล็อกอิน LINE · รอเจ้าของอนุมัติ
const Body = z.strictObject({
  id_token: z.string().min(5),
  nickname: z.string().trim().min(1).max(50),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
  consent: z.literal(true),
});

export async function POST(req: NextRequest) {
  try {
    await rateLimit(`driver-apply:${clientIp(req)}`, 10, 3600);
    const b = Body.parse(await req.json());
    const id = await identifyLine(b.id_token);
    await rateLimit(`driver-apply:line:${id.lineUserId}`, 5, 3600);
    return NextResponse.json(await submitApplication(id, { nickname: b.nickname, fullName: b.full_name, phone: b.phone }), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
