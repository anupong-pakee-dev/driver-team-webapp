import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveMapsLink } from "@/adapters/maps/links";
import { inThailand } from "@/domain/geo";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

// FR-BOOK-01 ลูกค้าวางลิงก์ Google Maps / พิกัด → คืนพิกัด (ไม่ใช้ API ที่มีค่าใช้จ่าย)
const Body = z.strictObject({ link: z.string().trim().min(3).max(2000) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`maps-link:${user.id}`, 30, 60);
    const { link } = Body.parse(await req.json());
    const p = await resolveMapsLink(link).catch(() => null);
    if (!p) throw new BizError("VALIDATION", { field: "link", problem: "no_coordinates" });
    if (!inThailand(p)) throw new BizError("VALIDATION", { field: "link", problem: "outside_thailand" });
    return NextResponse.json(p);
  } catch (e) {
    return errorResponse(e);
  }
}
