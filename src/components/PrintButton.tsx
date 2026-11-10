"use client";

import { useI18n } from "./I18nProvider";

// FR-QUOTE-01 "PDF": ใช้หน้าพิมพ์ของเบราว์เซอร์ (บันทึกเป็น PDF ได้) — ฟอนต์ไทยแสดงถูกต้องกว่าสร้าง PDF ฝั่งเซิร์ฟเวอร์
export function PrintButton({ className, label }: { className?: string; label?: string }) {
  const { t } = useI18n();
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label ?? t.common.print}
    </button>
  );
}
