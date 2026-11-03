// §7.1 คำนวณราคา (FR-PRICE-01, BR-PRICE-01/02/04) — กฎล้วน ไม่มี I/O · เงินเป็นสตางค์

export type PriceRule = {
  id: string;
  base_satang: number;
  included_km: number;
  per_km_satang: number;
  included_minutes: number;
  ot_per_hour_satang: number;
  floor_satang: number;
};

export type Extras = { child_seat_satang: number; stop_satang: number };

export type Breakdown = {
  km: number;
  extra_km: number;
  minutes: number;
  ot_hours: number;
  base: number;
  km_charge: number;
  ot_charge: number;
  extras: number;
  subtotal: number;
  computed: number;
};

/** ปัดขึ้นทีละ 10 บาท (1,000 สตางค์) */
export const roundUp10Baht = (satang: number) => Math.ceil(satang / 1000) * 1000;

export function price(i: {
  rule: PriceRule;
  distanceM: number;
  durationS: number;
  /** งานเหมา: จำนวนชั่วโมงที่ลูกค้าเลือก (แทนเวลาขับจริง) */
  hours?: number;
  extrasSatang: number;
}): Breakdown {
  const km = Math.ceil(i.distanceM / 1000);
  const extraKm = Math.max(0, km - i.rule.included_km);
  const minutes = i.hours ? i.hours * 60 : Math.ceil(i.durationS / 60);
  const otHours = Math.ceil(Math.max(0, minutes - i.rule.included_minutes) / 60);
  const kmCharge = extraKm * i.rule.per_km_satang;
  const otCharge = otHours * i.rule.ot_per_hour_satang;
  const subtotal = i.rule.base_satang + kmCharge + otCharge + i.extrasSatang;
  return {
    km, extra_km: extraKm, minutes, ot_hours: otHours,
    base: i.rule.base_satang, km_charge: kmCharge, ot_charge: otCharge, extras: i.extrasSatang,
    subtotal, computed: roundUp10Baht(subtotal),
  };
}

export const extrasFor = (e: Extras, childSeats: number, stops: number) =>
  childSeats * e.child_seat_satang + stops * e.stop_satang;

export type DiscountDecision = "ok" | "pending_approval";

export class PricingError extends Error {
  constructor(public code: "BELOW_FLOOR" | "INVALID_DISCOUNT") {
    super(code);
  }
}

/** BR-PRICE-01: ห้ามต่ำกว่า floor · BR-PRICE-02: sales_admin เกินเพดาน → รอ owner อนุมัติ */
export function checkDiscount(
  computed: number, discount: number, floor: number, role: "sales_admin" | "owner", adminMaxDiscount: number,
): DiscountDecision {
  if (!Number.isSafeInteger(discount) || discount < 0 || discount > computed) throw new PricingError("INVALID_DISCOUNT");
  if (computed - discount < floor) throw new PricingError("BELOW_FLOOR");
  if (role === "sales_admin" && discount > computed * adminMaxDiscount) return "pending_approval";
  return "ok";
}

/** BR-PAY-02 มัดจำ = deposit_pct ของราคา (ปัดเป็นสตางค์) — อย่างน้อย 1 สตางค์ */
export const depositFor = (finalSatang: number, depositPct: number) =>
  Math.max(1, Math.round(finalSatang * depositPct));
