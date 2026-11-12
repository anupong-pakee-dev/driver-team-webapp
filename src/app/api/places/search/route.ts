import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { searchPlaces } from "@/adapters/maps/reverse";
import { inThailand } from "@/domain/geo";
import { requireUser } from "@/lib/auth";
import { getLocale } from "@/lib/locale";
import { errorResponse } from "@/lib/errors";
import { rateLimit } from "@/lib/rateLimit";

// ค้นหาสถานที่บนแผนที่ปักหมุด (กดค้นหาเท่านั้น ไม่ค้นทุกตัวอักษร) · OpenStreetMap ฟรี · เฉพาะในไทย
const Body = z.strictObject({ q: z.string().trim().min(2).max(100) });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    await rateLimit(`place-search:${user.id}`, 15, 60);
    const { q } = Body.parse(await req.json());
    const hits = (await searchPlaces(q, await getLocale())).filter(inThailand);
    return NextResponse.json({ results: hits });
  } catch (e) {
    return errorResponse(e);
  }
}
