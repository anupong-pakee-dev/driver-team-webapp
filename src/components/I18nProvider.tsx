"use client";

import { createContext, useContext, type ReactNode } from "react";
import { DEFAULT_LOCALE, messages, type Locale } from "@/i18n";

// ส่งภาษาที่เซิร์ฟเวอร์เลือกให้ client component · นอก provider (หลังบ้าน/คนขับ) = ภาษาไทย
const Ctx = createContext<Locale>(DEFAULT_LOCALE);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <Ctx.Provider value={locale}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const locale = useContext(Ctx);
  return { locale, t: messages(locale) };
}
