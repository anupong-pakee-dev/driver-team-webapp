// §7.3 Dispatch (BR-DISP-02..04) · §7.6 ค่ารอ · §5.3 ช่วงเปิดเบอร์ลูกค้า (BR-FRAUD-01) — กฎล้วน

const HOUR = 3_600_000;
const MIN = 60_000;
const EPOCH = new Date(0);

export type Candidate = { driverId: string; vehicleId: string | null; lastAssignedAt: Date | null; score: number };

/** ลำดับ: คนขับเดิมที่ลูกค้าขอ → คิวเวียน (ได้งานล่าสุดนานที่สุดก่อน) → คะแนนสูงก่อน */
export function rankCandidates(cands: Candidate[], preferredDriverId: string | null): Candidate[] {
  return [...cands].sort((x, y) =>
    Number(y.driverId === preferredDriverId) - Number(x.driverId === preferredDriverId)
    || (x.lastAssignedAt ?? EPOCH).getTime() - (y.lastAssignedAt ?? EPOCH).getTime()
    || y.score - x.score
    || x.driverId.localeCompare(y.driverId));
}

/** เลือกคนละ 1 คัน (คนขับที่มีหลายคันในประเภทเดียวกัน → คันแรก) */
export function onePerDriver(cands: Candidate[]): Candidate[] {
  const seen = new Set<string>();
  return cands.filter((c) => (seen.has(c.driverId) ? false : (seen.add(c.driverId), true)));
}

/** BR-DISP-04: งานภายใน 3 ชม. ใช้ TTL ด่วน */
export function offerTtlMinutes(pickupAt: Date, now: Date, s: { offer_ttl_minutes: number; offer_ttl_urgent_minutes: number }) {
  return pickupAt.getTime() - now.getTime() < 3 * HOUR ? s.offer_ttl_urgent_minutes : s.offer_ttl_minutes;
}

/** §7.6 ค่ารอ: เกินเวลารอฟรี คิดทีละ 30 นาที × (อัตราต่อชม. / 2) */
export function waitFee(i: {
  arriveAt: Date; pickupAt: Date; pickedUpAt: Date; freeMinutes: number; waitPerHourSatang: number;
  /** สนามบินขาเข้า: เวลาเครื่องลงจริง (ถ้ามี) */
  landedAt?: Date | null;
}) {
  const start = i.landedAt ?? new Date(Math.max(i.arriveAt.getTime(), i.pickupAt.getTime()));
  const waited = Math.floor((i.pickedUpAt.getTime() - start.getTime()) / MIN);
  const over = Math.max(0, waited - i.freeMinutes);
  return { waitedMinutes: Math.max(0, waited), billableMinutes: over, feeSatang: Math.ceil(over / 30) * Math.round(i.waitPerHourSatang / 2) };
}

/** ระยะทางเส้นตรง (เมตร) — ใช้ตรวจ check-in ห่างจุดนัด */
export function distanceM(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export const CONTACT_STATUSES = ["assigned", "en_route", "arrived", "picked_up", "dropped_off"];

/** §5.3 / BR-FRAUD-01: pickup − N ชม. ถึง (เวลาส่งจริง หรือ est_end) + N ชม. และสถานะยังอยู่ระหว่างงาน */
export function contactAllowed(i: { status: string; pickupAt: Date; endAt: Date; now: Date; windowHours: number }) {
  if (!CONTACT_STATUSES.includes(i.status)) return false;
  const from = i.pickupAt.getTime() - i.windowHours * HOUR;
  const to = i.endAt.getTime() + i.windowHours * HOUR;
  return i.now.getTime() >= from && i.now.getTime() <= to;
}

/** ขั้นตอนวันงาน (FR-TRIP-01) → สถานะปลายทาง + ต้องมีรูปไหม (FR-TRIP-02) */
export const TRIP_STEPS = {
  depart: { from: "assigned", to: "en_route", photo: false },
  arrive: { from: "en_route", to: "arrived", photo: false },
  pickup: { from: "arrived", to: "picked_up", photo: true },
  dropoff: { from: "picked_up", to: "dropped_off", photo: true },
} as const;
export type TripStep = keyof typeof TRIP_STEPS;
