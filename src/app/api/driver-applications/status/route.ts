import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { pool } from "@/lib/db";
import { identifyLine } from "@/lib/lineIdentity";
import { errorResponse } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { applicationStatus } from "@/services/driverApplications";

// สถานะใบสมัครของ LINE นี้ (ยังไม่สมัคร / รออนุมัติ / ไม่ผ่าน / เป็นคนขับแล้ว)
const Body = z.strictObject({ id_token: z.string().min(5) });

export async function POST(req: NextRequest) {
  try {
    await rateLimit(`driver-apply-status:${clientIp(req)}`, 60, 600);
    const { id_token } = Body.parse(await req.json());
    const id = await identifyLine(id_token);
    const c = await pool.connect();
    try {
      return NextResponse.json(await applicationStatus(c, id.lineUserId));
    } finally {
      c.release();
    }
  } catch (e) {
    return errorResponse(e);
  }
}
