// เข้าสู่ระบบแทน LIFF สำหรับ local เท่านั้น (ยังไม่มี LINE channel) — ปิดเสมอใน production
export const devLoginEnabled = () => process.env.NODE_ENV !== "production" && process.env.DEV_LOGIN === "true";
