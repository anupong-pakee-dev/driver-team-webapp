// นับผู้เข้าชมเว็บแบบไม่ระบุตัวตน: ไม่ใช้คุกกี้ ไม่เก็บ IP/User-Agent
// ผู้เข้าชม = hash(เกลือรายวัน + IP + User-Agent) → นับคนไม่ซ้ำได้ภายในวันเดียว แต่ย้อนกลับเป็น IP ไม่ได้ และข้ามวันเชื่อมกันไม่ได้

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** /liff/customer/quotes/<uuid>?x=1 → /liff/customer/quotes/:id (รวมหน้าเดียวกัน ไม่เก็บ id/query) */
export function normalizePath(raw: string): string | null {
  let path: string;
  try {
    path = new URL(raw, "http://x").pathname;
  } catch {
    return null;
  }
  const clean = path.split("/").map((seg) => (UUID.test(seg) ? ":id" : seg)).join("/").replace(/\/+$/, "") || "/";
  if (clean.length > 120) return null;
  return clean;
}

/** เก็บเฉพาะหน้าที่ลูกค้า/ผู้สนใจเห็น — ไม่นับหลังบ้าน หน้าคนขับ หรือ API */
export const isCountedPath = (path: string) =>
  !/^\/(admin|api|dev|_next|liff\/driver)(\/|$)/.test(path);

const BOT = /bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|line-poker|curl|wget|python|axios|node-fetch/i;
export const isBot = (userAgent: string | null | undefined) => !userAgent || BOT.test(userAgent);

/** host ของหน้าที่ส่งมา (ไม่เก็บ path/query ของเว็บอื่น) · มาจากเว็บเราเอง = null */
export function referrerHost(referrer: string | null | undefined, ownHost: string): string | null {
  if (!referrer) return null;
  try {
    const h = new URL(referrer).hostname.replace(/^www\./, "");
    return h && h !== ownHost.replace(/^www\./, "") ? h.slice(0, 80) : null;
  } catch {
    return null;
  }
}

/** % ใช้ไปของโควตา (ปัดลง) และระดับเตือน */
export function quotaLevel(used: number, limit: number | null | undefined): { pct: number | null; level: "ok" | "warn" | "bad" } {
  if (!limit || limit <= 0) return { pct: null, level: "ok" };
  const pct = Math.floor((used / limit) * 100);
  return { pct, level: pct >= 95 ? "bad" : pct >= 80 ? "warn" : "ok" };
}

/** คาดการณ์สิ้นเดือนจากอัตราใช้ถึงวันนี้ (เวลาไทย) */
export function projectMonthEnd(used: number, dayOfMonth: number, daysInMonth: number): number {
  return dayOfMonth <= 0 ? used : Math.round((used / dayOfMonth) * daysInMonth);
}
