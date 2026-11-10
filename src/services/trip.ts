import "server-only";
import { randomUUID } from "node:crypto";
import { upload, MAX_UPLOAD_BYTES } from "@/adapters/storage";
import { cancellation, type CancelPolicy } from "@/domain/cancellation";
import { contactAllowed, distanceM, TRIP_STEPS, waitFee, type TripStep } from "@/domain/dispatch";
import { messages } from "@/i18n";
import type { SessionUser } from "@/lib/auth";
import { decryptField } from "@/lib/crypto";
import { pool, SYSTEM, withTx } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { formatBaht } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { bangkokToday } from "./compliance";
import { auditRejectedTransition, customerLink, notifyRoles, notifyUser, transition } from "./bookings";

// วันงาน: FR-TRIP-01..06, FR-FRAUD-01 · §6.2 guards · §10 auto_complete / reminders / future_job_guard

const IMAGE = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" } as const;

async function savePhoto(bookingId: string, kind: string, photo: File) {
  const ext = IMAGE[photo.type as keyof typeof IMAGE];
  if (!ext) throw new BizError("VALIDATION", { photo: "type" });
  if (photo.size > MAX_UPLOAD_BYTES) throw new BizError("VALIDATION", { photo: "size" });
  const path = `bookings/${bookingId}/${kind}-${randomUUID()}.${ext}`;
  await upload("checkins", path, await photo.arrayBuffer(), photo.type);
  return path;
}

/** FR-TRIP-01/02: ขั้นตอนวันงาน + check-in GPS (+ รูปตอนรับ/ส่ง) · ห่างจุดนัดเกินเกณฑ์ → ผ่านได้ + เตือน + แจ้ง owner */
export async function tripStep(driver: SessionUser, bookingId: string, step: TripStep,
                               gps: { lat: number; lng: number; accuracy_m?: number | null }, photo: File | null) {
  const def = TRIP_STEPS[step];
  if (def.photo && !photo) throw new BizError("VALIDATION", { photo: "required" });
  const s = await getSettings();
  const { rows: pre } = await pool.query(
    `select b.driver_id, b.status, b.pickup_at, b.balance_due, b.price_satang, b.service_type, q.origin, q.destination,
            q.flight_direction, r.free_wait_minutes, r.wait_per_hour_satang
       from bookings b join quotes q on q.id = b.quote_id join price_rules r on r.id = q.price_rule_id where b.id = $1`, [bookingId]);
  const b = pre[0];
  if (!b || b.driver_id !== driver.id) throw new BizError("NOT_FOUND");
  if (b.status !== def.from) {
    await auditRejectedTransition(bookingId, b.status, def.to, "driver", driver.id);
    throw new BizError("INVALID_TRANSITION", { from: b.status, step });
  }

  // §6.2 en_route: ไม่เร็วกว่า pickup − 3 ชม. ⚙️
  if (step === "depart") {
    const earliest = new Date(b.pickup_at).getTime() - Number(s.depart_window_hours ?? 3) * 3_600_000;
    if (Date.now() < earliest) throw new BizError("BUSINESS_RULE", { rule: "TOO_EARLY", earliest: new Date(earliest) });
  }
  const photoPath = photo ? await savePhoto(bookingId, step, photo) : null;
  const target = step === "dropoff" ? b.destination : step === "depart" ? null : b.origin;
  const dist = target?.lat != null ? distanceM(gps, { lat: target.lat, lng: target.lng }) : null;
  const far = dist !== null && dist > Number(s.far_from_target_m ?? 500);

  return withTx({ userId: driver.id, role: driver.role, reason: `trip ${step}` }, async (db) => {
    let warning: string | null = far ? "FAR_FROM_TARGET" : null;
    if (step === "depart" && b.balance_due === "before_start") {
      const { rows } = await db.query(
        `select coalesce(sum(amount_satang), 0)::bigint as paid from payments
          where booking_id = $1 and kind in ('deposit','balance') and status = 'verified'`, [bookingId]);
      if (Number(rows[0].paid) < Number(b.price_satang)) {
        // ❓ T10 บล็อกหรือแค่แจ้ง — ตั้งค่าได้ (ค่าเริ่ม: แจ้ง owner)
        if (s.block_start_if_unpaid === true) throw new BizError("BUSINESS_RULE", { rule: "BALANCE_UNPAID" });
        warning = warning ?? "BALANCE_UNPAID";
        await notifyRoles(db, ["owner"], `[ยอดคงเหลือยังไม่จ่าย] งาน ${formatBangkok(b.pickup_at)} คนขับออกเดินทางแล้ว`, `unpaid-start:${bookingId}`);
      }
    }
    await db.query(
      `insert into checkins (booking_id, kind, lat, lng, accuracy_m, distance_from_target_m, photo_path)
       values ($1, $2, $3, $4, $5, $6, $7)`,
      [bookingId, step, gps.lat, gps.lng, gps.accuracy_m ?? null, dist, photoPath]);

    const patch: Record<string, unknown> = {};
    if (step === "pickup") {
      const { rows: a } = await db.query(`select at from checkins where booking_id = $1 and kind = 'arrive'`, [bookingId]);
      const airportArrival = b.service_type === "airport_transfer" && b.flight_direction === "arrival";
      const w = waitFee({
        arriveAt: a[0]?.at ?? new Date(), pickupAt: new Date(b.pickup_at), pickedUpAt: new Date(),
        freeMinutes: airportArrival ? Number(s.airport_free_wait_minutes ?? 60) : b.free_wait_minutes,
        waitPerHourSatang: Number(b.wait_per_hour_satang),
      });
      patch.wait_minutes = w.billableMinutes;   // FR-PAY-09 เก็บเงินค่ารอเป็นงานเฟส 2
    }
    await transition(db, bookingId, def.to, "driver", patch);

    if (far) await notifyRoles(db, ["owner"], `[check-in ห่างจุดนัด ${dist} ม.] ${step} · งาน ${formatBangkok(b.pickup_at)}`, `far:${bookingId}:${step}`);
    const { rows: c } = await db.query(`select customer_id from bookings where id = $1`, [bookingId]);
    if (step === "arrive") await notifyUser(db, c[0].customer_id, (l) => messages(l).line.arrived, `arrived:${bookingId}`);
    if (step === "dropoff") {
      // FR-TRIP-03: ส่งลิงก์ยืนยัน/รีวิว
      await notifyUser(db, c[0].customer_id,
        (l) => messages(l).line.dropped(customerLink(`/bookings/${bookingId}`)), `dropped:${bookingId}`);
    }
    return { status: def.to, distance_from_target_m: dist, warning };
  });
}

/** §5.3 / FR-FRAUD-01: ขอชื่อ/เบอร์ลูกค้า — เฉพาะคนขับของงาน ในช่วงเวลา · บันทึกทุกครั้ง · นอกเวลา 403 + audit */
export async function revealContact(driver: SessionUser, bookingId: string) {
  const s = await getSettings();
  const { rows } = await pool.query(
    `select b.driver_id, b.status, b.pickup_at, b.est_end_at, b.customer_id,
            (select at from checkins c where c.booking_id = b.id and c.kind = 'dropoff') as dropped_at
       from bookings b where b.id = $1`, [bookingId]);
  const b = rows[0];
  const allowed = !!b && b.driver_id === driver.id && contactAllowed({
    status: b.status, pickupAt: new Date(b.pickup_at), endAt: new Date(b.dropped_at ?? b.est_end_at),
    now: new Date(), windowHours: Number(s.contact_window_hours ?? 2),
  });
  if (!allowed) {
    await pool.query(
      `insert into audit_logs (actor_id, actor_role, action, entity, entity_id, reason) values ($1, $2, 'CONTACT_DENIED', 'bookings', $3, 'outside window or not assigned')`,
      [driver.id, driver.role, bookingId]);
    throw new BizError("FORBIDDEN", { reason: "CONTACT_WINDOW" });
  }
  const { rows: n } = await pool.query(
    `select count(*)::int as n from contact_reveals where driver_id = $1 and at > now() - interval '1 day'`, [driver.id]);
  if (n[0].n >= Number(s.contact_rate_limit_per_day ?? 20)) throw new BizError("RATE_LIMITED");
  const { rows: u } = await pool.query(`select full_name_enc, phone_enc, display_name from users where id = $1`, [b.customer_id]);
  await withTx({ userId: driver.id, role: driver.role, reason: "contact reveal" }, (db) =>
    db.query(`insert into contact_reveals (booking_id, driver_id) values ($1, $2)`, [bookingId, driver.id]));
  return {
    name: u[0]?.full_name_enc ? decryptField(u[0].full_name_enc) : u[0]?.display_name ?? null,
    phone: u[0]?.phone_enc ? decryptField(u[0].phone_enc) : null,
  };
}

/** FR-TRIP-03: ลูกค้ายืนยันจบงาน + คะแนน */
export async function completeByCustomer(user: SessionUser, bookingId: string, r: { rating: number; comment?: string | null; consent_marketing: boolean }) {
  return withTx({ userId: user.id, role: user.role, reason: "customer completes" }, async (db) => {
    const { rows } = await db.query(`select customer_id from bookings where id = $1`, [bookingId]);
    if (!rows[0] || rows[0].customer_id !== user.id) throw new BizError("NOT_FOUND");
    await transition(db, bookingId, "completed", "customer", { customer_confirmed_at: new Date() });
    await db.query(`insert into reviews (booking_id, rating, comment, consent_marketing) values ($1, $2, $3, $4)`,
      [bookingId, r.rating, r.comment ?? null, r.consent_marketing]);
    if (r.consent_marketing) {
      await db.query(`insert into consents (user_id, kind, version, granted, channel, meta) values ($1, 'marketing_photo', 'review', true, 'liff', $2)`,
        [user.id, { booking_id: bookingId }]);
    }
    // payout item → ready (เฟส 6) · คะแนนคนขับตาม BR-FRAUD-04 ❓ หลัง pilot
    return { status: "completed" };
  });
}

/** FR-TRIP-04: ร้องเรียนภายใน 24 ชม. หลังส่ง → disputed (พัก payout) · แจ้ง owner + sales ทันที */
export async function complain(user: SessionUser, bookingId: string, description: string) {
  const hours = Number((await getSettings()).auto_complete_hours ?? 24);
  return withTx({ userId: user.id, role: user.role, reason: "complaint" }, async (db) => {
    const { rows } = await db.query(
      `select b.customer_id, b.status, b.pickup_at, (select at from checkins c where c.booking_id = b.id and c.kind = 'dropoff') as dropped_at
         from bookings b where b.id = $1 for update of b`, [bookingId]);
    const b = rows[0];
    if (!b || b.customer_id !== user.id) throw new BizError("NOT_FOUND");
    if (!["dropped_off", "completed"].includes(b.status)) throw new BizError("INVALID_TRANSITION");
    if (b.dropped_at && Date.now() - new Date(b.dropped_at).getTime() > hours * 3_600_000) {
      throw new BizError("BUSINESS_RULE", { rule: "COMPLAINT_WINDOW_CLOSED" });
    }
    await db.query(`insert into complaints (booking_id, customer_id, description) values ($1, $2, $3)`, [bookingId, user.id, description]);
    if (b.status === "dropped_off") await transition(db, bookingId, "disputed", "customer");
    await notifyRoles(db, ["owner", "sales_admin"], `[ร้องเรียน] งาน ${formatBangkok(b.pickup_at)}: ${description.slice(0, 200)}`, `complaint:${bookingId}:${Date.now()}`);
    return { status: b.status === "dropped_off" ? "disputed" : b.status };
  });
}

/** owner ปิดข้อร้องเรียน: disputed → completed */
export async function resolveDispute(owner: SessionUser, bookingId: string, resolution: string) {
  return withTx({ userId: owner.id, role: owner.role, reason: `resolve: ${resolution}` }, async (db) => {
    await db.query(`update complaints set status = 'resolved', resolution = $2, closed_at = now() where booking_id = $1 and status = 'open'`, [bookingId, resolution]);
    const { rows } = await db.query(`select status from bookings where id = $1`, [bookingId]);
    if (rows[0]?.status === "disputed") await transition(db, bookingId, "completed", "owner");
    return { status: "completed" };
  });
}

/** FR-TRIP-05: บันทึกเหตุการณ์ (คนขับของงาน / owner) → แจ้ง owner + sales ทันที */
export async function reportIncident(user: SessionUser, bookingId: string,
                                     i: { type: string; description: string; actions?: string | null }, photo: File | null) {
  const { rows } = await pool.query(`select driver_id, pickup_at from bookings where id = $1`, [bookingId]);
  if (!rows[0] || (user.role === "driver" && rows[0].driver_id !== user.id)) throw new BizError("NOT_FOUND");
  if (i.type === "no_show" && !photo) throw new BizError("VALIDATION", { photo: "required" });
  const photoPath = photo ? await savePhoto(bookingId, `incident-${i.type}`, photo) : null;
  return withTx({ userId: user.id, role: user.role, reason: `incident ${i.type}` }, async (db) => {
    const { rows: r } = await db.query(
      `insert into incidents (booking_id, type, reported_by, description, actions, photo_path) values ($1,$2,$3,$4,$5,$6) returning id`,
      [bookingId, i.type, user.id, i.description, i.actions ?? null, photoPath]);
    await notifyRoles(db, ["owner", "sales_admin"],
      `[เหตุการณ์: ${i.type}] งาน ${formatBangkok(rows[0].pickup_at)} โดย ${user.displayName}: ${i.description.slice(0, 200)}`, `incident:${r[0].id}`);
    return { id: r[0].id as string };
  });
}

/** §6.2 no_show: ถึงแล้ว + เลยเวลารอฟรี + มีรายงานพร้อมรูป + owner ยืนยัน → คืนเงิน/ส่วนคนขับตาม §7.4 */
export async function confirmNoShow(owner: SessionUser, bookingId: string, reason: string) {
  const s = await getSettings();
  return withTx({ userId: owner.id, role: owner.role, reason: `no-show: ${reason}` }, async (db) => {
    const { rows } = await db.query(
      `select b.status, b.pickup_at, b.service_type, b.customer_id, q.flight_direction, r.free_wait_minutes, r.wait_per_hour_satang,
              (select at from checkins c where c.booking_id = b.id and c.kind = 'arrive') as arrived_at,
              exists (select 1 from incidents i where i.booking_id = b.id and i.type = 'no_show' and i.photo_path is not null) as reported,
              coalesce((select sum(amount_satang) from payments p where p.booking_id = b.id and p.kind = 'deposit' and p.status = 'verified'), 0)::bigint as dep,
              coalesce((select sum(amount_satang) from payments p where p.booking_id = b.id and p.kind = 'balance' and p.status = 'verified'), 0)::bigint as bal
         from bookings b join quotes q on q.id = b.quote_id join price_rules r on r.id = q.price_rule_id
        where b.id = $1 for update of b`, [bookingId]);
    const b = rows[0];
    if (!b) throw new BizError("NOT_FOUND");
    if (!b.reported) throw new BizError("BUSINESS_RULE", { rule: "NO_SHOW_REPORT_WITH_PHOTO_REQUIRED" });
    const free = b.service_type === "airport_transfer" && b.flight_direction === "arrival" ? Number(s.airport_free_wait_minutes ?? 60) : b.free_wait_minutes;
    const start = Math.max(new Date(b.arrived_at ?? 0).getTime(), new Date(b.pickup_at).getTime());
    if (Date.now() < start + free * 60_000) throw new BizError("BUSINESS_RULE", { rule: "FREE_WAIT_NOT_OVER" });
    const fee = waitFee({ arriveAt: new Date(b.arrived_at), pickupAt: new Date(b.pickup_at), pickedUpAt: new Date(), freeMinutes: free, waitPerHourSatang: Number(b.wait_per_hour_satang) });
    const r = cancellation({ depositPaid: Number(b.dep), balancePaid: Number(b.bal), pickupAt: new Date(b.pickup_at), waitFee: fee.feeSatang },
      "no_show", new Date(), s.cancellation_policy as CancelPolicy);
    // ส่วนคนขับไม่เกินยอดที่ลูกค้าจ่ายจริง
    const driver = Math.min(r.driver, Number(b.dep) + Number(b.bal) - r.refund);
    await transition(db, bookingId, "no_show", "owner", {
      refund_satang: r.refund, driver_share_satang: driver, cancel_rule: "no_show", wait_minutes: fee.billableMinutes,
      cancelled_by: "company", cancel_reason: reason, cancelled_at: new Date(),
    });
    if (r.refund > 0) {
      await db.query(`insert into payments (booking_id, kind, method, amount_satang, status, requested_by, reason)
                      values ($1, 'refund', 'manual', $2, 'pending', $3, 'no_show')`, [bookingId, r.refund, owner.id]);
    }
    await db.query(`update incidents set status = 'resolved', resolved_by = $2, resolution = $3, closed_at = now()
                     where booking_id = $1 and type = 'no_show' and status = 'open'`, [bookingId, owner.id, reason]);
    await notifyUser(db, b.customer_id, (l) => messages(l).line.noShow(r.refund > 0 ? formatBaht(r.refund) : null), `noshow:${bookingId}`);
    return { status: "no_show", refund_satang: r.refund, driver_satang: driver };
  });
}

// ───────────── jobs ─────────────

/** §10 auto_complete (ทุก 15 นาที): ส่งแล้ว ≥ 24 ชม. ไม่มีร้องเรียน → completed */
export async function autoComplete() {
  const hours = Number((await getSettings()).auto_complete_hours ?? 24);
  return withTx({ ...SYSTEM, reason: "auto_complete job" }, async (db) => {
    const { rows } = await db.query(
      `select b.id from bookings b join checkins c on c.booking_id = b.id and c.kind = 'dropoff'
        where b.status = 'dropped_off' and c.at <= now() - make_interval(hours => $1)
          and not exists (select 1 from complaints x where x.booking_id = b.id and x.status = 'open')
        for update of b skip locked`, [hours]);
    for (const r of rows) await transition(db, r.id, "completed", "system");
    return { completed: rows.length };
  });
}

/** §10 reminders (ทุก 15 นาที): วันก่อนงาน 18:00 และ 2 ชม. ก่อน → ลูกค้า + คนขับ */
export async function reminders(now = new Date()) {
  const bkkHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", hour12: false }).format(now));
  const tomorrow = new Date(Date.parse(`${bangkokToday(now)}T00:00:00+07:00`) + 86_400_000);
  return withTx({ ...SYSTEM, reason: "reminders job" }, async (db) => {
    let sent = 0;
    if (bkkHour >= 18) {
      const { rows } = await db.query(
        `select id, customer_id, driver_id, pickup_at from bookings
          where status in ('confirmed','assigned') and pickup_at >= $1 and pickup_at < $1::timestamptz + interval '1 day'`, [tomorrow]);
      for (const b of rows) {
        await notifyUser(db, b.customer_id, (l) => messages(l).line.remindDay(formatBangkok(b.pickup_at, l)), `remind:${b.id}:day`);
        if (b.driver_id) await notifyUser(db, b.driver_id, `เตือน: พรุ่งนี้มีงาน ${formatBangkok(b.pickup_at)}`, `remind:${b.id}:day:driver`);
        sent++;
      }
    }
    const { rows: soon } = await db.query(
      `select id, customer_id, driver_id, pickup_at from bookings
        where status in ('assigned','en_route') and pickup_at > now() and pickup_at <= now() + interval '2 hours'`);
    for (const b of soon) {
      await notifyUser(db, b.customer_id, (l) => messages(l).line.remind2h(formatBangkok(b.pickup_at, l)), `remind:${b.id}:2h`);
      if (b.driver_id) await notifyUser(db, b.driver_id, `อีกไม่เกิน 2 ชม. มีงาน ${formatBangkok(b.pickup_at)} — เปิดแอปเพื่อออกเดินทาง`, `remind:${b.id}:2h:driver`);
      sent++;
    }
    return { reminded: sent };
  });
}

/** §10 future_job_guard (BR-COMP-04): งาน assigned ที่คนขับ/รถจะไม่ eligible ณ วันงาน → แจ้ง owner + เสนอคนแทน */
export async function futureJobGuard() {
  return withTx({ ...SYSTEM, reason: "future_job_guard job" }, async (db) => {
    const { rows } = await db.query(
      `select b.id, b.pickup_at, assignment_problems(b.id, b.driver_id, b.vehicle_id) as problems
         from bookings b where b.status = 'assigned' and b.pickup_at > now()`);
    const bad = rows.filter((r) => r.problems.some((p: string) => p !== "time_conflict"));
    for (const r of bad) {
      await notifyRoles(db, ["owner"], `[คนขับ/รถจะไม่ผ่านเกณฑ์ ณ วันงาน] ${formatBangkok(r.pickup_at)}: ${r.problems.join(", ")} — เปลี่ยนคนขับในหลังบ้าน`,
        `future-guard:${r.id}:${bangkokToday()}`);
    }
    return { flagged: bad.length };
  });
}
