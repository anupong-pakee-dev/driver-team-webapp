import type { Messages } from "./th";

// ตัวช่วยภาษาที่ไม่ผูกกับพจนานุกรม — client component import จากไฟล์นี้ได้โดยไม่ลากข้อความทั้ง 3 ภาษาเข้า bundle

// ภาษาฝั่งลูกค้า: ไทย (ค่าเริ่ม) · อังกฤษ · จีนตัวย่อ — เลือกจาก cookie "lang" → บัญชี → ภาษาของ LINE/เบราว์เซอร์
export const LOCALES = ["th", "en", "zh"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "th";
export const LOCALE_COOKIE = "lang";
export const LOCALE_NAMES: Record<Locale, string> = { th: "ไทย", en: "EN", zh: "中文" };
export const HTML_LANG: Record<Locale, string> = { th: "th", en: "en", zh: "zh-Hans" };

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** "zh-TW" / "en-US" / "th" (ภาษาของ LINE หรือเบราว์เซอร์) → Locale ที่รองรับ หรือ null */
export function pickLocale(tag: string | null | undefined): Locale | null {
  const base = tag?.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
}

/** Accept-Language: "zh-CN,zh;q=0.9,en;q=0.8" → ภาษาแรกที่รองรับตามลำดับ q */
export function negotiate(acceptLanguage: string | null | undefined): Locale | null {
  if (!acceptLanguage) return null;
  const tags = acceptLanguage.split(",").map((part) => {
    const [tag, ...params] = part.trim().split(";");
    const q = Number(params.find((p) => p.trim().startsWith("q="))?.split("=")[1] ?? 1);
    return { tag, q: Number.isFinite(q) ? q : 0 };
  }).sort((a, b) => b.q - a.q);
  for (const t of tags) {
    const l = pickLocale(t.tag);
    if (l) return l;
  }
  return null;
}


/** ชื่อจาก settings แบบ name_th / name_en / name_zh — ไม่มีภาษานั้นใช้อังกฤษ แล้วค่อยไทย */
export function localized<T extends object>(obj: T | undefined | null, field: string, locale: Locale): string {
  const o = (obj ?? {}) as Record<string, unknown>;
  const v = o[`${field}_${locale}`] ?? (locale !== "th" ? o[`${field}_en`] : undefined) ?? o[`${field}_th`];
  return typeof v === "string" ? v : "";
}

/** ข้อความ error จาก API ({ error: { message_th, message_en, message_zh } }) ตามภาษา */
export function apiErrorText(body: unknown, locale: Locale): string | undefined {
  const e = (body as { error?: Record<string, unknown> } | null)?.error;
  const v = e?.[`message_${locale}`] ?? e?.message_en ?? e?.message_th;
  return typeof v === "string" ? v : undefined;
}

export type { Messages };
