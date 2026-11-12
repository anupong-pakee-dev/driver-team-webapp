import type { ReactNode } from "react";
import type { Locale } from "@/i18n/core";
import { I18nClientProvider } from "./i18nClient";

// ส่งภาษาที่เซิร์ฟเวอร์เลือกให้ client component (ใช้ใน server component)
// client component อ่านด้วย useI18n() จาก ./i18nContext — ไม่ import "@/i18n" (จะลากพจนานุกรมทั้ง 3 ภาษาไปฝั่ง client)
export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <I18nClientProvider locale={locale}>{children}</I18nClientProvider>;
}
