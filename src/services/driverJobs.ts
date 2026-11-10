import "server-only";
import { asUser, pool } from "@/lib/db";
import type { SessionUser } from "@/lib/auth";

// ข้อมูลหน้าคนขับ: RLS ยืนยันว่าเป็นงาน/ข้อเสนอของคนขับคนนี้ แล้วเติมรายละเอียดเส้นทางจาก quotes ด้วยสิทธิ์เซิร์ฟเวอร์
// (คนขับอ่านตาราง quotes ตรงไม่ได้ · ไม่มีชื่อ/เบอร์ลูกค้า — ต้องขอผ่าน /contact)

const TRIP_FIELDS = `q.origin, q.destination, q.stops, q.flight_no, q.airport, q.flight_direction, q.pax, q.luggage,
                     q.child_seats, q.hours, q.notes`;

export async function driverOffers(user: SessionUser) {
  const ids = await asUser(user.authUserId, async (db) =>
    (await db.query(`select id from job_offers where driver_id = $1 order by offered_at desc limit 30`, [user.id])).rows.map((r) => r.id));
  if (!ids.length) return [];
  const { rows } = await pool.query(
    `select o.id, o.result, o.offered_at, o.expires_at, o.reject_reason, o.is_override, o.booking_id,
            b.status as booking_status, b.service_type, b.car_type, b.pickup_at, b.price_satang::int, v.plate, ${TRIP_FIELDS}
       from job_offers o join bookings b on b.id = o.booking_id join quotes q on q.id = b.quote_id
       left join vehicles v on v.id = o.vehicle_id
      where o.id = any($1) order by o.offered_at desc`, [ids]);
  return rows;
}

export async function driverJobs(user: SessionUser) {
  return asUser(user.authUserId, async (db) => (await db.query(
    `select id, status, pickup_at, service_type, car_type from bookings
      where driver_id = $1 and status in ('assigned','en_route','arrived','picked_up','dropped_off') order by pickup_at`, [user.id])).rows);
}

export async function driverJob(user: SessionUser, bookingId: string) {
  const mine = await asUser(user.authUserId, async (db) =>
    (await db.query(`select id from bookings where id = $1 and driver_id = $2`, [bookingId, user.id])).rows[0]);
  if (!mine) return null;
  const { rows } = await pool.query(
    `select b.id, b.status, b.service_type, b.car_type, b.pickup_at, b.est_end_at, b.price_satang::int, b.balance_due,
            v.plate, v.insurance_claim_phone, v.voluntary_insurer, ${TRIP_FIELDS},
            coalesce((select sum(amount_satang) from payments p where p.booking_id = b.id and p.kind in ('deposit','balance') and p.status = 'verified'), 0)::int as paid,
            (select json_object_agg(kind, at) from checkins c where c.booking_id = b.id) as checkins
       from bookings b join quotes q on q.id = b.quote_id left join vehicles v on v.id = b.vehicle_id
      where b.id = $1`, [bookingId]);
  return rows[0];
}
