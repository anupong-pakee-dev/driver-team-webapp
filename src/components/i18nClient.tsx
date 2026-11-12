"use client";

import { use, useMemo, type ReactNode } from "react";
import type { Locale, Messages } from "@/i18n/core";
import { th } from "@/i18n/th";
import { I18nContext } from "./i18nContext";

// ไทย (ภาษาหลัก) อยู่ใน bundle เสมอ · อังกฤษ/จีน แยก chunk โหลดเฉพาะผู้ใช้ภาษานั้น
// (ระหว่างรอ chunk หน้าจอยังเป็น HTML ที่เซิร์ฟเวอร์ render ไว้แล้ว — แค่ hydrate ช้าลงเล็กน้อย)
const loaders: Record<Exclude<Locale, "th">, () => Promise<Messages>> = {
  en: () => import("@/i18n/en").then((m) => m.en),
  zh: () => import("@/i18n/zh").then((m) => m.zh),
};
const loaded = new Map<Locale, Promise<Messages>>();

function load(locale: Exclude<Locale, "th">): Promise<Messages> {
  let p = loaded.get(locale);
  if (!p) {
    p = loaders[locale]();
    loaded.set(locale, p);
  }
  return p;
}

export function I18nClientProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const t = locale === "th" || !(locale in loaders) ? th : use(load(locale));
  const value = useMemo(() => ({ locale, t }), [locale, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}
