// ประหยัดโควตา LINE OA: ทุกข้อความ push นับโควตา (reply ตอบปุ่มในแชทไม่นับ)
// แยกประเภทจาก prefix ของ dedupe key (ทุก push มี) → เปิด/ปิดได้ใน settings.line_push
// ปิด = ไม่ส่ง LINE เท่านั้น ข้อมูลยังเห็นในแอป/เว็บตามปกติ

export const LINE_PUSH_CATEGORIES = {
  quotes: "ใบเสนอราคา + เตือนใกล้หมดอายุ (ลูกค้า)",
  offers: "ข้อเสนองานใหม่ (คนขับ)",
  booking: "ยืนยันการจอง / ได้คนขับแล้ว (ลูกค้า) · เจ้าของมอบงาน (คนขับ)",
  reminders: "เตือนก่อนเดินทาง / คนขับถึงจุดรับ",
  job_closed: "ได้งานแล้ว / ปิดงานแล้ว (คนขับ)",
  payments: "รับชำระ / ใบเสร็จ / จ่ายครบ / โอนค่างาน",
  cancellations: "ยกเลิก / คืนเงิน / หมดเวลามัดจำ / ไม่มาตามนัด",
  trip_end: "ถึงที่หมาย + ให้คะแนน (ลูกค้า)",
  driver_admin: "ผลตรวจเอกสาร / เอกสารใกล้หมดอายุ (คนขับ)",
  staff: "แจ้งเตือนเจ้าของ/แอดมิน (งานใหม่ สลิป ร้องเรียน ฯลฯ)",
} as const;

export type LinePushCategory = keyof typeof LINE_PUSH_CATEGORIES;

/** ค่าเริ่มต้นตามที่เจ้าของเลือก (2026-11-13): เก็บเฉพาะที่จำเป็นต่อการรับงาน/เดินทาง */
export const LINE_PUSH_DEFAULTS: Record<LinePushCategory, boolean> = {
  quotes: true, offers: true, booking: true, reminders: true, job_closed: true,
  payments: false, cancellations: false, trip_end: false, driver_admin: false, staff: false,
};

const PREFIX: Record<string, LinePushCategory> = {
  "quote": "quotes", "quote-remind": "quotes",
  "offer": "offers",
  "confirmed": "booking", "assigned": "booking", "override": "booking",
  "remind": "reminders", "arrived": "reminders",
  "won": "job_closed", "taken": "job_closed",
  "paid": "payments", "balance-paid-driver": "payments", "payout-paid": "payments",
  "cancelled": "cancellations", "refunded": "cancellations", "expired": "cancellations", "noshow": "cancellations",
  "dropped": "trip_end",
  "doc-review": "driver_admin", "doc-expiry": "driver_admin",
  "confirmed-staff": "staff", "slip-review": "staff", "slip-bad": "staff", "manual-req": "staff", "refund": "staff",
  "no-driver": "staff", "drv-cancel": "staff", "complaint": "staff", "incident": "staff", "unpaid-start": "staff",
  "far": "staff", "future-guard": "staff", "new-device": "staff", "discount": "staff",
};

/** ประเภทของข้อความจาก dedupe key เช่น "offer:<id>" → offers · ไม่รู้จัก = null */
export function linePushCategory(dedupeKey: string | null | undefined): LinePushCategory | null {
  if (!dedupeKey) return null;
  return PREFIX[dedupeKey.split(":")[0]] ?? null;
}

/** ส่งได้ไหม: ไม่รู้จักประเภท/ไม่มี key → ส่ง (ไม่ทำให้ข้อความสำคัญหายเงียบ) */
export function linePushAllowed(dedupeKey: string | null | undefined, setting: Partial<Record<string, boolean>> | null | undefined): boolean {
  const cat = linePushCategory(dedupeKey);
  if (!cat) return true;
  return setting?.[cat] ?? LINE_PUSH_DEFAULTS[cat];
}
