import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { LOCALES, LOCALE_COOKIE } from "@/i18n";
import { currentUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { errorResponse } from "@/lib/errors";

// ลูกค้าเลือกภาษา → cookie (หน้าเว็บ) + users.locale (ข้อความ LINE ที่ส่งทีหลัง)
const Body = z.strictObject({ locale: z.enum(LOCALES) });

export async function POST(req: NextRequest) {
  try {
    const { locale } = Body.parse(await req.json());
    const user = await currentUser();
    if (user && user.locale !== locale) {
      await withTx({ userId: user.id, role: user.role, reason: "change language" }, (db) =>
        db.query(`update users set locale = $2 where id = $1`, [user.id, locale]));
    }
    const res = NextResponse.json({ locale });
    res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: req.nextUrl.protocol === "https:" });
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
