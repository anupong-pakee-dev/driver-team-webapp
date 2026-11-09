import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { getSetting } from "@/lib/settings";
import { recordTouchpoint } from "@/services/ads";

// FR-ADS-02 · §8.2 GET /go/{slug} → 302
//   target=landing: ส่งต่อพารามิเตอร์ไปหน้า landing (หน้า landing ขอความยินยอมก่อนผูกคน/เก็บ click id — FR-ADS-10)
//   target=line_oa: นับคลิกแบบไม่ผูกคน แล้วไปหน้าเพิ่มเพื่อน LINE OA
const PASS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid", "fbclid", "ttclid"];

export async function GET(req: NextRequest, ctx: RouteContext<"/go/[slug]">) {
  const { slug } = await ctx.params;
  try {
    await rateLimit(`go:${clientIp(req)}`, 60, 60);
  } catch {
    return NextResponse.redirect(new URL("/", req.url));
  }
  const { rows } = await pool.query(
    `select slug, target, service_type, utm_source, utm_medium, utm_campaign from campaigns
      where slug = $1 and status = 'active'
        and (start_at is null or start_at <= current_date) and (end_at is null or end_at >= current_date)`, [slug]);
  const c = rows[0];
  if (!c) return NextResponse.redirect(new URL("/", req.url));

  if (c.target === "line_oa") {
    const oa = await getSetting<string>("line_oa_url");
    await recordTouchpoint({ anon_id: null, consented: false, campaign_slug: slug, service_type: c.service_type,
      utm_source: c.utm_source, utm_medium: c.utm_medium, utm_campaign: c.utm_campaign, landing_url: req.nextUrl.pathname });
    if (oa) return NextResponse.redirect(oa);
  }
  const to = new URL(`/l/${c.service_type ?? "airport_transfer"}`, req.url);
  to.searchParams.set("c", slug);
  for (const k of PASS) {
    const v = req.nextUrl.searchParams.get(k) ?? (k.startsWith("utm_") ? c[k] : null);
    if (v) to.searchParams.set(k, v);
  }
  return NextResponse.redirect(to);
}
