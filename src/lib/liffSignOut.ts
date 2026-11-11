// หลังผู้ใช้กด "ออกจากระบบ" ในแอป LIFF: จำไว้ในเครื่องว่าไม่ต้อง login อัตโนมัติอีก
// จนกว่าจะกด "เข้าสู่ระบบด้วย LINE" เอง (ในแอป LINE ผู้ใช้ login อยู่เสมอ จึงต้องใช้ตัวนี้กันเด้งกลับ)

export type LiffApp = "customer" | "driver";
const key = (app: LiffApp) => `liff_signed_out:${app}`;

export function markSignedOut(app: LiffApp) {
  try { localStorage.setItem(key(app), "1"); } catch { /* private mode: ไม่จำ ก็แค่ login อัตโนมัติเหมือนเดิม */ }
}

export function clearSignedOut(app: LiffApp) {
  try { localStorage.removeItem(key(app)); } catch { /* ignore */ }
}

export function isSignedOut(app: LiffApp): boolean {
  try { return localStorage.getItem(key(app)) === "1"; } catch { return false; }
}

export const liffIdFor = (app: LiffApp) =>
  app === "customer" ? process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER : process.env.NEXT_PUBLIC_LIFF_ID_DRIVER;
