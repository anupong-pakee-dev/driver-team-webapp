import "server-only";
import { offerFlex } from "@/adapters/line/flex";
import { offerTtlMinutes, onePerDriver, rankCandidates, type Candidate } from "@/domain/dispatch";
import { messages } from "@/i18n";
import type { SessionUser } from "@/lib/auth";
import { SYSTEM, withTx, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "./portal";
import { enqueue } from "./outbox";
import { notifyRoles, notifyUser, transition } from "./bookings";

// §7.3 Dispatch: ประกาศงานถึงคนขับทุกคนที่ผ่านเกณฑ์ ณ วันงานพร้อมกัน · ใครกดรับก่อนได้งาน · คนอื่นได้แจ้งว่ามีคนรับแล้ว
// TTL · คนสำรอง · override (FR-DISP-01..03) · ไม่มีใครรับภายในเวลา → แจ้งเจ้าของเลือกเอง

const driverLink = (path: string) =>
  process.env.NEXT_PUBLIC_LIFF_ID_DRIVER
    ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_DRIVER}${path}`
    : `${process.env.APP_URL ?? "http://localhost:3000"}/liff/driver${path}`;

async function settingsOf(db: Db) {
  const { rows } = await db.query(`select key, value from settings where key in ('offer_ttl_minutes','offer_ttl_urgent_minutes','commission_rate')`);
  const m = Object.fromEntries(rows.map((r) => [r.key, Number(r.value)]));
  return { offer_ttl_minutes: m.offer_ttl_minutes ?? 15, offer_ttl_urgent_minutes: m.offer_ttl_urgent_minutes ?? 5, commission_rate: m.commission_rate ?? 0.2 };
}

export async function rankedCandidates(db: Pick<Db, "query">, bookingId: string, includeOffered = false): Promise<Candidate[]> {
  const { rows } = await db.query(`select driver_id, vehicle_id, last_assigned_at, score from dispatch_candidates($1, $2)`, [bookingId, includeOffered]);
  const { rows: b } = await db.query(`select preferred_driver_id from bookings where id = $1`, [bookingId]);
  return onePerDriver(rankCandidates(
    rows.map((r) => ({ driverId: r.driver_id, vehicleId: r.vehicle_id, lastAssignedAt: r.last_assigned_at, score: r.score })),
    b[0]?.preferred_driver_id ?? null,
  ));
}

/**
 * งาน confirmed ที่ไม่มี offer ค้าง → ประกาศถึงคนขับทุกคนที่ผ่านเกณฑ์ (ไม่ซ้ำคนที่เคยได้ข้อเสนองานนี้)
 * ไม่มีใคร → แจ้ง owner + sales · reoffer: ประกาศอีกรอบรวมคนที่เคยได้ (หลังคนขับยกเลิก / เจ้าของสั่ง) ยกเว้น exclude
 */
export async function dispatchNext(db: Db, bookingId: string, opts: { reoffer?: boolean; exclude?: string } = {}) {
  const { rows } = await db.query(
    `select b.id, b.status, b.service_type, b.car_type, b.pickup_at, b.price_satang, b.backup_driver_id, q.origin, q.destination
       from bookings b join quotes q on q.id = b.quote_id where b.id = $1 for update of b`, [bookingId]);
  const b = rows[0];
  if (!b || b.status !== "confirmed") return { offered: null, reason: "NOT_CONFIRMED" };
  const pending = await db.query(`select id from job_offers where booking_id = $1 and result = 'pending'`, [bookingId]);
  if (pending.rows[0]) return { offered: pending.rows[0].id as string, reason: "ALREADY_PENDING" };

  const s = await settingsOf(db);
  const cands = (await rankedCandidates(db, bookingId, opts.reoffer ?? false)).filter((c) => c.driverId !== opts.exclude);
  if (!cands.length) {
    await notifyRoles(db, ["owner", "sales_admin"],
      `[ไม่มีคนรับงาน] ${formatBangkok(b.pickup_at)} · ${carLabel(b.car_type)} — เลือกคนขับเองในหลังบ้าน`,
      `no-driver:${bookingId}:${new Date().toISOString().slice(0, 13)}`);
    return { offered: null, reason: "NO_CANDIDATE" };
  }

  const ttl = offerTtlMinutes(new Date(b.pickup_at), new Date(), s);
  const offered: string[] = [];
  for (const c of cands) offered.push(await sendOffer(db, b, c, ttl, s.commission_rate, cands.length > 1));
  return { offered: offered[0] ?? null, offers: offered.length };
}

type OfferBooking = { id: string; service_type: string; car_type: string; pickup_at: string | Date; price_satang: string | number;
  origin?: { name?: string } | null; destination?: { name?: string } | null };

/** สร้างข้อเสนองาน 1 รายการ + ส่ง LINE ให้คนขับ (ถ้าผูก LINE แล้ว) */
async function sendOffer(db: Db, b: OfferBooking, c: Candidate, ttl: number, commissionRate: number, competing: boolean) {
  const pay = Math.round(Number(b.price_satang) * (1 - commissionRate));
  const { rows: o } = await db.query(
    `insert into job_offers (booking_id, driver_id, vehicle_id, expires_at)
     values ($1, $2, $3, now() + make_interval(mins => $4)) returning id, expires_at`,
    [b.id, c.driverId, c.vehicleId, ttl]);
  const offer = o[0];
  const { rows: d } = await db.query(`select line_user_id from users where id = $1`, [c.driverId]);
  if (d[0]?.line_user_id) {
    await enqueue(db, "line.push", {
      to: d[0].line_user_id,
      messages: [offerFlex({
        offerId: offer.id,
        serviceLabel: SERVICE_TYPES.find((x) => x.value === b.service_type)?.label ?? b.service_type,
        carLabel: carLabel(b.car_type),
        route: [b.origin?.name, b.destination?.name].filter(Boolean).join(" → "),
        pickupText: formatBangkok(b.pickup_at),
        payText: `ประมาณ ${formatBaht(pay)} (ก่อนหัก ณ ที่จ่าย)`,
        expiresText: formatBangkok(offer.expires_at),
        url: driverLink("/"),
        competing,
      })],
    }, `offer:${offer.id}`);
  }
  return offer.id as string;
}

/**
 * คนขับเปิด/ปิดรับงาน
 * - ปิด: ข้อเสนอที่ค้างอยู่ถูกถอน (งานที่รับแล้วไม่กระทบ) · งานที่ไม่เหลือข้อเสนอค้าง → ประกาศรอบถัดไป/แจ้งเจ้าของ
 * - เปิด: งานที่ยืนยันแล้วแต่ยังไม่มีคนขับ และคนนี้ผ่านเกณฑ์ → ส่งข้อเสนอให้ทันที
 */
export async function setAcceptingJobs(driver: SessionUser, on: boolean) {
  return withTx({ userId: driver.id, role: driver.role, reason: on ? "driver on" : "driver off" }, async (db) => {
    const r = await db.query(`update drivers set accepting_jobs = $2 where user_id = $1 returning user_id`, [driver.id, on]);
    if (!r.rows[0]) throw new BizError("NOT_FOUND");
    if (!on) {
      // ล็อกงานก่อนข้อเสนอ (ลำดับเดียวกับ acceptOffer) กัน deadlock ตอนมีคนกดรับพร้อมกัน
      await db.query(
        `select id from bookings where id in (select booking_id from job_offers where driver_id = $1 and result = 'pending')
          order by id for update`, [driver.id]);
      const { rows } = await db.query(
        `update job_offers set result = 'withdrawn', reject_reason = 'driver off'
          where driver_id = $1 and result = 'pending' returning booking_id`, [driver.id]);
      for (const bookingId of new Set(rows.map((x) => x.booking_id as string))) await dispatchNext(db, bookingId);
      return { on, offered: 0, withdrawn: rows.length };
    }
    const s = await settingsOf(db);
    const { rows: open } = await db.query(
      `select b.id, b.service_type, b.car_type, b.pickup_at, b.price_satang, q.origin, q.destination
         from bookings b join quotes q on q.id = b.quote_id
        where b.status = 'confirmed' and b.driver_id is null and b.pickup_at > now()
        order by b.pickup_at`);
    let offered = 0;
    for (const b of open) {
      const mine = (await rankedCandidates(db, b.id)).find((c) => c.driverId === driver.id);
      if (!mine) continue;
      const ttl = offerTtlMinutes(new Date(b.pickup_at), new Date(), s);
      await sendOffer(db, b, mine, ttl, s.commission_rate, true);
      offered++;
    }
    return { on, offered, withdrawn: 0 };
  });
}

/** FR-DISP-02: คนขับรับงาน → ตรวจซ้ำ ณ วันงาน → assigned + คนสำรอง + แจ้งลูกค้า · ปิดข้อเสนอของคนอื่น (มีคนรับแล้ว) */
export async function acceptOffer(driver: SessionUser, offerId: string, vehicleId?: string | null) {
  return withTx({ userId: driver.id, role: driver.role, reason: "accept offer" }, async (db) => {
    // ล็อกงานก่อนข้อเสนอเสมอ: คนขับหลายคนกดรับพร้อมกัน → เข้าคิวที่งาน คนแรกได้ คนถัดไปเห็นว่ามีคนรับแล้ว (ไม่ deadlock)
    const { rows: ref } = await db.query(`select booking_id from job_offers where id = $1`, [offerId]);
    if (!ref[0]) throw new BizError("NOT_FOUND");
    const { rows: bk } = await db.query(`select status from bookings where id = $1 for update`, [ref[0].booking_id]);
    const { rows } = await db.query(`select * from job_offers where id = $1 for update`, [offerId]);
    const o = rows[0];
    if (!o || o.driver_id !== driver.id) throw new BizError("NOT_FOUND");
    if (o.result === "taken" || (o.result === "pending" && bk[0]?.status !== "confirmed")) {
      throw new BizError("INVALID_TRANSITION", { reason: "OFFER_TAKEN" });
    }
    if (o.result !== "pending") throw new BizError("INVALID_TRANSITION", { reason: `OFFER_${String(o.result).toUpperCase()}` });
    if (new Date(o.expires_at) <= new Date()) throw new BizError("INVALID_TRANSITION", { reason: "OFFER_EXPIRED" });
    const vehicle = vehicleId ?? o.vehicle_id;
    const { rows: p } = await db.query(`select assignment_problems($1, $2, $3) as r`, [o.booking_id, driver.id, vehicle]);
    const problems: string[] = p[0].r;
    if (problems.includes("time_conflict")) throw new BizError("INVALID_TRANSITION", { reason: "TIME_CONFLICT" });
    if (problems.length) throw new BizError("NOT_ELIGIBLE", { reasons: problems });

    await db.query(`update job_offers set result = 'accepted', vehicle_id = $2 where id = $1`, [offerId, vehicle]);
    await transition(db, o.booking_id, "assigned", "driver", { driver_id: driver.id, vehicle_id: vehicle });
    await closeOtherOffers(db, o.booking_id, "taken");
    await db.query(`update drivers set last_assigned_at = now() where user_id = $1`, [driver.id]);
    // §7.3 ข้อ 4: คนถัดไปในคิว = คนสำรอง (บันทึกเฉยๆ ไม่ส่ง offer)
    const backup = (await rankedCandidates(db, o.booking_id)).find((c) => c.driverId !== driver.id);
    await db.query(`update bookings set backup_driver_id = $2 where id = $1`, [o.booking_id, backup?.driverId ?? null]);
    await notifyAssigned(db, o.booking_id);
    return { booking_id: o.booking_id as string, status: "assigned" };
  });
}

/** ปิดข้อเสนอที่ยังค้างของงานนี้ แล้วแจ้งคนขับเหล่านั้นทาง LINE ว่ามีคนรับแล้ว (taken) หรือเจ้าของมอบให้คนอื่น (withdrawn) */
async function closeOtherOffers(db: Db, bookingId: string, result: "taken" | "withdrawn") {
  const { rows } = await db.query(
    `update job_offers o set result = $2 where booking_id = $1 and result = 'pending'
     returning o.id, o.driver_id, (select pickup_at from bookings where id = $1) as pickup_at`, [bookingId, result]);
  for (const r of rows) {
    await notifyUser(db, r.driver_id, `งาน ${formatBangkok(r.pickup_at)} มีคนรับแล้ว — ขอบคุณที่สนใจ รอข้อเสนองานถัดไปได้เลย`, `taken:${r.id}`);
  }
}

async function notifyAssigned(db: Db, bookingId: string) {
  const { rows } = await db.query(
    `select b.customer_id, b.pickup_at, u.display_name, v.plate from bookings b
       join users u on u.id = b.driver_id left join vehicles v on v.id = b.vehicle_id where b.id = $1`, [bookingId]);
  const r = rows[0];
  // §6.3: แจ้งลูกค้า (ชื่อเล่นคนขับ, ทะเบียน) — ไม่ส่งเบอร์คนขับ (แชทผ่าน LINE OA)
  await notifyUser(db, r.customer_id,
    (l) => messages(l).line.assigned(r.display_name, r.plate ?? null, formatBangkok(r.pickup_at, l)),
    `assigned:${bookingId}:${r.display_name}`);
}

export async function rejectOffer(driver: SessionUser, offerId: string, reason: string) {
  return withTx({ userId: driver.id, role: driver.role, reason: `reject offer: ${reason}` }, async (db) => {
    const { rows } = await db.query(
      `update job_offers set result = 'rejected', reject_reason = $3 where id = $1 and driver_id = $2 and result = 'pending'
       returning booking_id`, [offerId, driver.id, reason]);
    if (!rows[0]) throw new BizError("INVALID_TRANSITION");
    // ปฏิเสธครบทุกคนแล้ว → ไม่มีคนใหม่ให้ประกาศ → แจ้งเจ้าของ (ยังมีคนอื่นค้างอยู่ = รอต่อ)
    await dispatchNext(db, rows[0].booking_id);
    return { status: "rejected" };
  });
}

/** §10 expire_offers (ทุก 1 นาที) */
export async function expireOffers() {
  return withTx({ ...SYSTEM, reason: "expire_offers job" }, async (db) => {
    const { rows } = await db.query(
      `update job_offers set result = 'expired' where id in (
         select id from job_offers where result = 'pending' and expires_at <= now() for update skip locked)
       returning booking_id`);
    for (const r of rows) await dispatchNext(db, r.booking_id);
    return { expired: rows.length };
  });
}

/** FR-DISP-03: owner เลือกคนขับเอง (ต้องมีเหตุผล · ยัง eligible เท่านั้น — BR-COMP-03 override eligibility ไม่ได้) */
export async function overrideAssign(owner: SessionUser, bookingId: string, driverId: string, vehicleId: string | null, reason: string) {
  return withTx({ userId: owner.id, role: owner.role, reason: `override: ${reason}` }, async (db) => {
    const { rows } = await db.query(`select status from bookings where id = $1 for update`, [bookingId]);
    if (!rows[0]) throw new BizError("NOT_FOUND");
    if (rows[0].status === "assigned") {
      // เปลี่ยนคนขับ: กลับไป confirmed ก่อน
      await transition(db, bookingId, "confirmed", "owner", { driver_id: null, vehicle_id: null });
    }
    const { rows: p } = await db.query(`select assignment_problems($1, $2, $3) as r`, [bookingId, driverId, vehicleId]);
    if (p[0].r.length) throw new BizError("NOT_ELIGIBLE", { reasons: p[0].r });
    await closeOtherOffers(db, bookingId, "withdrawn");
    await db.query(
      `insert into job_offers (booking_id, driver_id, vehicle_id, expires_at, result, is_override, override_reason)
       values ($1, $2, $3, now(), 'accepted', true, $4)`, [bookingId, driverId, vehicleId, reason]);
    await transition(db, bookingId, "assigned", "owner", { driver_id: driverId, vehicle_id: vehicleId });
    await db.query(`update drivers set last_assigned_at = now() where user_id = $1`, [driverId]);
    await notifyAssigned(db, bookingId);
    await notifyUser(db, driverId, `ได้รับมอบหมายงาน ${formatBangkok((await db.query(`select pickup_at from bookings where id = $1`, [bookingId])).rows[0].pickup_at)} — ดูในแอป`, `override:${bookingId}:${driverId}`);
    return { status: "assigned" };
  });
}

/** owner สั่งประกาศงานรอบใหม่ (เช่น หลังเพิ่มคนขับ) — รวมคนที่เคยได้ข้อเสนอแล้ว */
export async function redispatch(owner: SessionUser, bookingId: string) {
  return withTx({ userId: owner.id, role: owner.role, reason: "redispatch" }, (db) => dispatchNext(db, bookingId, { reoffer: true }));
}

/** §6.3 assigned → confirmed: คนขับยกเลิก → ประกาศงานอีกรอบถึงทุกคนที่ผ่านเกณฑ์ (ยกเว้นคนที่ยกเลิก) · strike เมื่อเปิด penalties_enabled */
export async function driverCancel(driver: SessionUser, bookingId: string, reason: string) {
  return withTx({ userId: driver.id, role: driver.role, reason: `driver cancel: ${reason}` }, async (db) => {
    const { rows } = await db.query(`select driver_id, pickup_at from bookings where id = $1 for update`, [bookingId]);
    if (!rows[0] || rows[0].driver_id !== driver.id) throw new BizError("NOT_FOUND");
    await transition(db, bookingId, "confirmed", "driver", { driver_id: null, vehicle_id: null });
    await db.query(`insert into incidents (booking_id, type, reported_by, description) values ($1, 'other', $2, $3)`,
      [bookingId, driver.id, `คนขับยกเลิกงาน: ${reason}`]);
    await notifyRoles(db, ["owner", "sales_admin"], `[คนขับยกเลิก] ${driver.displayName} · ${formatBangkok(rows[0].pickup_at)} — ${reason}`, `drv-cancel:${bookingId}:${driver.id}`);
    const next = await dispatchNext(db, bookingId, { reoffer: true, exclude: driver.id });
    return { status: "confirmed", next_offer: next.offered };
  });
}

