// FR-ADS-17 เช็กลิสต์ก่อนเผยแพร่ข้อความแอด/landing (Legal §7)
export const LANDING_CHECKS = [
  "insurance_true",      // คำว่า "มีประกัน" จริงทุกคันที่รับงาน
  "background_true",     // "คนขับผ่านการตรวจประวัติ" จริงทุกคน
  "price_true",          // ราคา "เริ่ม" ตรงกับราคาขายจริง (BR-PRICE-04)
  "not_tour",            // ไม่สื่อเป็นทัวร์/จัดโปรแกรมเที่ยว
  "media_consent",       // รูปคนขับ/รีวิวมี consent
  "company_channels",    // ช่องทางติดต่อเป็นของบริษัทเท่านั้น (BR-ADS-01)
] as const;

export const LANDING_CHECK_TH: Record<(typeof LANDING_CHECKS)[number], string> = {
  insurance_true: "คำว่า “มีประกันคุ้มครองผู้โดยสาร” เป็นจริงทุกคันที่รับงาน",
  background_true: "“คนขับทุกคนผ่านการตรวจประวัติและใบขับขี่” เป็นจริงทุกคน",
  price_true: "ราคา “เริ่ม” ตรงกับราคาที่ขายได้จริง",
  not_tour: "ไม่สื่อว่าเป็นทัวร์หรือจัดโปรแกรมเที่ยว",
  media_consent: "รูปคนขับ/รีวิวที่ใช้มีความยินยอมแล้ว",
  company_channels: "ช่องทางติดต่อทั้งหมดเป็นของบริษัท ไม่ใช่ของคนขับ",
};
