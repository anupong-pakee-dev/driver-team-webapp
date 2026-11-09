"use client";

// FR-QUOTE-01 "PDF": ใช้หน้าพิมพ์ของเบราว์เซอร์ (บันทึกเป็น PDF ได้) — ฟอนต์ไทยแสดงถูกต้องกว่าสร้าง PDF ฝั่งเซิร์ฟเวอร์
export function PrintButton({ className, label = "บันทึก PDF / พิมพ์" }: { className?: string; label?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.print()}>
      {label}
    </button>
  );
}
