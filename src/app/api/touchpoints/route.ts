import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { errorResponse } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { recordTouchpoint } from "@/services/ads";

// §8.2 POST /api/touchpoints — หน้า landing บันทึกที่มา (§7.7 ข้อ 1)
// ยินยอม (cookie mc=1) → anon_id first-party + click id · ไม่ยินยอม → นับแคมเปญอย่างเดียว
const S = z.string().trim().max(200).nullable().optional();
const Body = z.strictObject({
  campaign_slug: S, service_type: S, utm_source: S, utm_medium: S, utm_campaign: S, utm_content: S,
  gclid: z.string().max(500).nullable().optional(), fbclid: z.string().max(500).nullable().optional(), ttclid: z.string().max(500).nullable().optional(),
  landing_url: z.string().max(500).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    await rateLimit(`touch:${clientIp(req)}`, 60, 60);
    const b = Body.parse(await req.json());
    const jar = await cookies();
    const consented = jar.get("mc")?.value === "1";
    let anon = jar.get("aid")?.value ?? null;
    if (consented && !anon) {
      anon = randomUUID();
      jar.set("aid", anon, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 180 * 86400 });
    }
    const id = await recordTouchpoint({ ...b, anon_id: consented ? anon : null, consented });
    return NextResponse.json({ touchpoint_id: id, consented }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
