import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, negotiate, pickLocale } from "@/i18n";
import { startSession } from "@/lib/auth";
import { SYSTEM, withTx } from "@/lib/db";
import { identifyLine } from "@/lib/lineIdentity";
import { errorResponse } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { redeemInvite } from "@/services/drivers";
import { upsertLineUser } from "@/services/users";

const Body = z.strictObject({
  id_token: z.string().min(5),
  app: z.enum(["customer", "driver"]),
  invite_token: z.string().min(10).max(100).optional(),
  lang: z.string().max(20).optional(),   // liff.getLanguage() — ภาษาของแอป LINE
});


export async function POST(req: NextRequest) {
  try {
    await rateLimit(`liff-login:${clientIp(req)}`, 30, 60);
    const body = Body.parse(await req.json());
    const identity = await identifyLine(body.id_token);
    const userId = await withTx({ ...SYSTEM, reason: body.invite_token ? "driver invite redeem" : "liff login" }, (db) =>
      body.app === "driver" && body.invite_token
        ? redeemInvite(db, body.invite_token, identity)
        : upsertLineUser(db, identity, body.app));
    await startSession(userId, "liff");
    const res = NextResponse.json({ ok: true });
    if (body.app === "customer") {
      // ภาษาที่ลูกค้าเลือกไว้ (cookie) มาก่อน → ภาษาของ LINE → เบราว์เซอร์ → ไทย · บันทึกในบัญชีไว้ส่งข้อความ LINE
      const chosen = req.cookies.get(LOCALE_COOKIE)?.value;
      const locale = isLocale(chosen) ? chosen : pickLocale(body.lang) ?? negotiate(req.headers.get("accept-language")) ?? DEFAULT_LOCALE;
      await withTx({ ...SYSTEM, reason: "customer language" }, (db) => db.query(`update users set locale = $2 where id = $1`, [userId, locale]));
      res.cookies.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax", httpOnly: true, secure: req.nextUrl.protocol === "https:" });
    }
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
