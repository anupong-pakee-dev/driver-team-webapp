import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { reverseGeocode } from "@/adapters/maps/reverse";
import { inThailand } from "@/domain/geo";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

// ลูกค้าตั้งจุด (GPS / ปักหมุด) → เติมชื่อสถานที่ให้อัตโนมัติ (แก้เองได้) · ใช้ OpenStreetMap ฟรี
const Body = z.strictObject({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`place-name:${user.id}`, 20, 60);
    const p = Body.parse(await req.json());
    if (!inThailand(p)) throw new BizError("VALIDATION", { field: "place", problem: "outside_thailand" });
    return NextResponse.json({ name: await reverseGeocode(p) });
  } catch (e) {
    return errorResponse(e);
  }
}
