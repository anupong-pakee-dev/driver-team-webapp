"use client";

import { createContext, useContext } from "react";
import type { Locale, Messages } from "@/i18n/core";
import { th } from "@/i18n/th";

// ภาษาปัจจุบัน + พจนานุกรมของภาษานั้นเท่านั้น (ตั้งค่าโดย I18nProvider) · นอก provider (หลังบ้าน/คนขับ) = ภาษาไทย
export const I18nContext = createContext<{ locale: Locale; t: Messages }>({ locale: "th", t: th });

export function useI18n() {
  return useContext(I18nContext);
}
