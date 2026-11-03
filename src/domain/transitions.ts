// §6.1 แหล่งความจริงเดียวของ state machine — seed ลง booking_transitions (มี test ตรวจว่าตรงกัน)

export const BOOKING_STATUSES = [
  "awaiting_deposit", "confirmed", "assigned", "en_route", "arrived", "picked_up",
  "dropped_off", "completed", "disputed", "cancelled", "no_show", "expired",
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];
export type TransitionActor = "system" | "customer" | "driver" | "owner";

export const TRANSITIONS = {
  awaiting_deposit: { confirmed: ["system"], expired: ["system"], cancelled: ["customer", "owner"] },
  confirmed:        { assigned: ["driver", "owner"], cancelled: ["customer", "owner"] },
  assigned:         { confirmed: ["driver", "owner"],          // คนขับยกเลิก → กลับไปหาคนใหม่
                      en_route: ["driver"], cancelled: ["customer", "owner"] },
  en_route:         { arrived: ["driver"] },
  arrived:          { picked_up: ["driver"], no_show: ["owner"] },   // คนขับแจ้ง → owner ยืนยัน
  picked_up:        { dropped_off: ["driver"] },
  dropped_off:      { completed: ["customer", "system"], disputed: ["customer"] },
  disputed:         { completed: ["owner"] },
} as const satisfies Partial<Record<BookingStatus, Partial<Record<BookingStatus, readonly TransitionActor[]>>>>;

export function allowedActors(from: BookingStatus, to: BookingStatus): readonly TransitionActor[] {
  const row = (TRANSITIONS as Partial<Record<BookingStatus, Partial<Record<BookingStatus, readonly TransitionActor[]>>>>)[from];
  return row?.[to] ?? [];
}

export const canTransition = (from: BookingStatus, to: BookingStatus, actor: TransitionActor) =>
  allowedActors(from, to).includes(actor);

/** คู่ (from, to) ทั้งหมด — ใช้เทียบกับ seed ใน migration */
export function transitionPairs(): [BookingStatus, BookingStatus][] {
  return Object.entries(TRANSITIONS).flatMap(([from, tos]) =>
    Object.keys(tos).map((to): [BookingStatus, BookingStatus] => [from as BookingStatus, to as BookingStatus]));
}
