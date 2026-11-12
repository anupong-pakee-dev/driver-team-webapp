import { en } from "./en";
import { th, type Messages } from "./th";
import { zh } from "./zh";
import type { Locale } from "./core";

export * from "./core";

// พจนานุกรมครบ 3 ภาษา — ฝั่งเซิร์ฟเวอร์ใช้ได้เลย · ฝั่ง client ให้ใช้ useI18n() (โหลดเฉพาะภาษาที่ใช้อยู่)
const ALL: Record<Locale, Messages> = { th, en, zh };
export const messages = (locale: Locale): Messages => ALL[locale] ?? th;
