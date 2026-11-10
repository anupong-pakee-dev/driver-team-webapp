import "server-only";
import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, messages, negotiate, type Locale } from "@/i18n";

// ภาษาของคำขอนี้ (ฝั่งลูกค้า): cookie ที่ลูกค้าเลือก/ระบบตั้งตอน login → Accept-Language → ไทย
export async function getLocale(): Promise<Locale> {
  const c = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(c)) return c;
  return negotiate((await headers()).get("accept-language")) ?? DEFAULT_LOCALE;
}

export async function getI18n() {
  const locale = await getLocale();
  return { locale, t: messages(locale) };
}
