import "server-only";
import type { Db } from "@/lib/db";

// ข้อมูลงาน + การเงิน สำหรับหน้าจอ (อ่านผ่าน RLS ด้วย db จาก asUser)

export type PaymentRow = {
  id: string; kind: string; method: string; amount_satang: number; status: string; reason: string | null;
  expires_at: string | null; created_at: string; slip_file_path: string | null; proof_file_path: string | null;
  raw: Record<string, unknown> | null; requested_by_name: string | null; receipt_id: string | null; receipt_number: string | null;
};

export async function loadBooking(db: Db, id: string) {
  const { rows } = await db.query(
    `select b.id, b.status, b.service_type, b.car_type, b.pickup_at, b.est_end_at, b.price_satang::int, b.deposit_satang::int,
            b.balance_due, b.customer_id, b.created_at, b.cancelled_at, b.cancelled_by, b.cancel_reason,
            b.refund_satang::int, b.driver_share_satang::int, b.cancel_rule, b.quote_id, b.source_platform, b.campaign_id,
            q.number as quote_number, q.revision, q.origin, q.destination, q.stops, q.flight_no, q.airport, q.flight_direction,
            q.pax, q.luggage, q.hours, q.notes
       from bookings b join quotes q on q.id = b.quote_id where b.id = $1`,
    [id],
  );
  const b = rows[0];
  if (!b) return null;
  const { rows: payments } = await db.query<PaymentRow>(
    `select p.id, p.kind, p.method, p.amount_satang::int, p.status, p.reason, p.expires_at, p.created_at,
            p.slip_file_path, p.proof_file_path, p.raw, u.display_name as requested_by_name,
            r.id as receipt_id, r.number as receipt_number
       from payments p
       left join users u on u.id = p.requested_by
       left join receipts r on r.payment_id = p.id
      where p.booking_id = $1 order by p.created_at`,
    [id],
  );
  const paid = payments.filter((p) => p.status === "verified" && p.kind !== "refund").reduce((s, p) => s + p.amount_satang, 0);
  const out: Record<string, any> & { payments: PaymentRow[]; paid_satang: number; due_satang: number } = // eslint-disable-line @typescript-eslint/no-explicit-any
    { ...b, payments, paid_satang: paid, due_satang: Math.max(0, b.price_satang - paid) };
  return out;
}

export type BookingView = NonNullable<Awaited<ReturnType<typeof loadBooking>>>;

export const BOOKING_STATUS_TH: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  awaiting_deposit: ["รอมัดจำ", "warn"],
  confirmed: ["ยืนยันแล้ว · รอจัดคนขับ", "ok"],
  assigned: ["ได้คนขับแล้ว", "ok"],
  en_route: ["คนขับกำลังไป", "info"],
  arrived: ["คนขับถึงจุดรับ", "info"],
  picked_up: ["กำลังเดินทาง", "info"],
  dropped_off: ["ส่งถึงแล้ว", "info"],
  completed: ["จบงาน", "ok"],
  disputed: ["มีข้อร้องเรียน", "bad"],
  cancelled: ["ยกเลิก", "bad"],
  no_show: ["ไม่พบผู้โดยสาร", "bad"],
  expired: ["หมดเวลามัดจำ", "bad"],
};

export const PAYMENT_KIND_TH: Record<string, string> = {
  deposit: "มัดจำ", balance: "ยอดคงเหลือ", refund: "คืนเงิน", reimbursement: "เบิกคืน", wait_fee: "ค่ารอ",
};

export const PAYMENT_STATUS_TH: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  pending: ["รอชำระ", "info"],
  verified: ["ชำระแล้ว", "ok"],
  pending_approval: ["รอตรวจ", "warn"],
  failed: ["ไม่สำเร็จ/ยกเลิก", "bad"],
  refunded: ["โอนคืนแล้ว", "ok"],
};

export const SLIP_REASON_TH: Record<string, string> = {
  MANUAL_REVIEW: "รอเจ้าหน้าที่ตรวจสลิป",
  AMOUNT_MISMATCH: "ยอดในสลิปน้อยกว่ายอดที่ต้องชำระ",
  RECEIVER_MISMATCH: "บัญชีผู้รับไม่ใช่บัญชีบริษัท",
  DUPLICATE: "สลิปนี้เคยใช้แล้ว",
  TOO_OLD: "เวลาโอนก่อนสร้างรายการ",
  EXPIRED: "หมดเวลาชำระ",
  BOOKING_CANCELLED: "งานถูกยกเลิก",
};
