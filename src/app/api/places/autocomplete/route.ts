import { NextResponse, type NextRequest } from "next/server";
import { autocomplete } from "@/adapters/maps/places";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

// §9.3 ค้นสถานที่ (ผ่านเซิร์ฟเวอร์) — ต้อง login เพื่อจำกัดการใช้ API ที่มีค่าใช้จ่าย
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const q = (req.nextUrl.searchParams.get("q") ?? "").slice(0, 100);
    const session = (req.nextUrl.searchParams.get("session") ?? "").slice(0, 100);
    return NextResponse.json({ suggestions: await autocomplete(q, session) });
  } catch (e) {
    return errorResponse(e);
  }
}
