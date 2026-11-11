import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { createStaffInvite } from "@/services/staff";

// owner เพิ่มแอดมิน → ลิงก์เชิญใช้ครั้งเดียว 72 ชม. (ผู้ได้รับเชิญตั้งรหัสผ่านเอง)
const Body = z.strictObject({
  email: z.email().max(254),
  display_name: z.string().trim().min(1).max(60),
  role: z.enum(["sales_admin", "owner"]),
});

export async function POST(req: NextRequest) {
  try {
    const owner = await requireUser(["owner"]);
    const b = Body.parse(await req.json());
    const inv = await createStaffInvite(owner, { email: b.email, displayName: b.display_name, role: b.role });
    return NextResponse.json(
      { link: `${req.nextUrl.origin}/admin/join?t=${inv.token}`, expires_in_hours: inv.ttlHours },
      { status: 201 },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
