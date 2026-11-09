import "server-only";
import type { Db } from "@/lib/db";
import { depositFor, type Breakdown } from "@/domain/pricing";
import { getSetting } from "@/lib/settings";

// ข้อมูลใบเสนอราคาสำหรับหน้าจอ (อ่านผ่าน RLS ด้วย db จาก asUser)

export type QuoteViewData = {
  id: string; number: string; revision: number; status: string;
  service_type: string; car_type: string;
  origin: { name: string } | null; destination: { name: string } | null; stops: { name: string }[];
  pickup_at: string; hours: number | null; pax: number; luggage: number; child_seats: number;
  flight_no: string | null; airport: string | null; flight_direction: string | null; no_flight: boolean;
  distance_m: number | null; duration_s: number | null; distance_source: string | null;
  breakdown: Breakdown; computed_satang: number; discount_satang: number; discount_reason: string | null;
  final_satang: number; deposit_satang: number; tax_category: string; expires_at: string; created_at: string;
  notes: string | null; customer_id: string; latest_id: string;
};

export async function loadQuote(db: Db, id: string): Promise<QuoteViewData | null> {
  const { rows } = await db.query(
    `select q.id, q.number, q.revision, q.status, q.service_type, q.car_type, q.origin, q.destination, q.stops,
            q.pickup_at, q.hours, q.pax, q.luggage, q.child_seats, q.flight_no, q.airport, q.flight_direction, q.no_flight,
            q.distance_m, q.duration_s, q.distance_source, q.breakdown, q.computed_satang::int, q.discount_satang::int,
            q.discount_reason, q.final_satang::int, q.tax_category, q.expires_at, q.created_at, q.notes, q.customer_id,
            (select l.id from quotes l where l.number = q.number and l.status <> 'pending_approval'
              order by l.revision desc limit 1) as latest_id
       from quotes q where q.id = $1`,
    [id],
  );
  if (!rows[0]) return null;
  const pct = (await getSetting<number>("deposit_pct")) ?? 0.3;
  return { ...rows[0], deposit_satang: depositFor(rows[0].final_satang, Number(pct)) };
}

export const QUOTE_STATUS_TH: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  draft: ["ร่าง", "info"],
  sent: ["รอยืนยัน", "info"],
  pending_approval: ["รออนุมัติส่วนลด", "warn"],
  accepted: ["ยืนยันแล้ว", "ok"],
  expired: ["หมดอายุ", "bad"],
  superseded: ["มีฉบับใหม่แล้ว", "warn"],
  rejected: ["ไม่อนุมัติ", "bad"],
};
