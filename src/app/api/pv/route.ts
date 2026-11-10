import { createHmac } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { isBot, isCountedPath, normalizePath, referrerHost } from "@/domain/analytics";
import { LOCALE_COOKIE, isLocale } from "@/i18n";
import { pool } from "@/lib/db";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { bangkokToday } from "@/services/compliance";

// นับการเปิดหน้า (ฝั่งลูกค้า) แบบไม่ระบุตัวตน — ไม่ใช้คุกกี้ ไม่เก็บ IP/UA · ตอบ 204 เสมอ (ไม่ให้หน้าเว็บสะดุด)
const Body = z.object({ path: z.string().max(500), ref: z.string().max(500).nullable().optional() });

export async function POST(req: NextRequest) {
  try {
    const ua = req.headers.get("user-agent");
    if (isBot(ua)) return new NextResponse(null, { status: 204 });
    const ip = clientIp(req);
    await rateLimit(`pv:${ip}`, 120, 60);
    const body = Body.parse(await req.json());
    const path = normalizePath(body.path);
    if (!path || !isCountedPath(path)) return new NextResponse(null, { status: 204 });
    const day = bangkokToday();
    // เกลือเปลี่ยนทุกวัน: hash วันนี้กับพรุ่งนี้ของคนเดียวกันไม่ตรงกัน → นับคนไม่ซ้ำรายวันได้ แต่ติดตามข้ามวันไม่ได้
    const salt = createHmac("sha256", process.env.SESSION_SECRET ?? "pv").update(`pv:${day}`).digest();
    const visitor = createHmac("sha256", salt).update(`${ip}|${ua}`).digest("base64url").slice(0, 22);
    const lang = req.cookies.get(LOCALE_COOKIE)?.value;
    await pool.query(
      `insert into page_views (day, path, visitor, locale, referrer) values ($1, $2, $3, $4, $5)`,
      [day, path, visitor, isLocale(lang) ? lang : null, referrerHost(body.ref, req.nextUrl.hostname)]);
  } catch {
    // นับไม่ได้ (เกินโควตา/ข้อมูลผิด/DB) ไม่กระทบผู้ใช้
  }
  return new NextResponse(null, { status: 204 });
}
