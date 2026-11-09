// §7.4 ยกเลิกและคืนเงิน (BR-CANCEL-01 ร่าง ❓ ทนาย) — กฎล้วน · เงินเป็นสตางค์
// ยอดคงเหลือที่จ่ายแล้วคืนเต็มเสมอ — นโยบายหักเฉพาะมัดจำ · ส่วนต่างที่เหลือ = รายได้บริษัท

export type CancelPolicy = {
  full_refund_hours: number;                     // > ชั่วโมงนี้ คืนมัดจำเต็ม (48)
  mid: { refundPct: number; driverPct: number }; // 24–48 ชม.
  late: { driverPct: number };                   // < 24 ชม.
  noShowDriverPct: number;
  mid_hours?: number;                            // ขอบล่างของช่วงกลาง (24)
};

export type CancelBy = "customer" | "company" | "flight_cancelled" | "no_show";
export type CancelRule = "company" | "flight_cancelled" | "no_show" | ">48h" | "24-48h" | "<24h";

export type CancelResult = { refund: number; driver: number; company: number; rule: CancelRule };

const HOUR = 3_600_000;
const pct = (satang: number, p: number) => Math.round((satang * p) / 100);

export function cancellation(
  b: { depositPaid: number; balancePaid: number; pickupAt: Date; waitFee?: number },
  by: CancelBy,
  now: Date,
  p: CancelPolicy,
): CancelResult {
  const dep = b.depositPaid;
  const bal = b.balancePaid;
  const done = (refund: number, driver: number, rule: CancelRule): CancelResult =>
    ({ refund, driver, company: dep + bal - refund - driver, rule });

  if (by === "company") return done(dep + bal, 0, "company");
  if (by === "flight_cancelled") return done(dep + bal, 0, "flight_cancelled");
  if (by === "no_show") return done(bal, pct(dep, p.noShowDriverPct) + (b.waitFee ?? 0), "no_show");

  const h = (b.pickupAt.getTime() - now.getTime()) / HOUR;
  const midFloor = p.mid_hours ?? 24;
  // ขอบ: 48 ชม. พอดี → แถว 24–48 · 24 ชม. พอดี → แถว 24–48
  if (h > p.full_refund_hours) return done(dep + bal, 0, ">48h");
  if (h >= midFloor) return done(pct(dep, p.mid.refundPct) + bal, pct(dep, p.mid.driverPct), "24-48h");
  return done(bal, pct(dep, p.late.driverPct), "<24h");
}
