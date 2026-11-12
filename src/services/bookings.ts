import "server-only";
import { randomUUID } from "node:crypto";
import { createCharge, type AdapterName } from "@/adapters/payments";
import { getCharge } from "@/adapters/payments/omise";
import { readSlip, SlipProviderUnavailable } from "@/adapters/payments/slipVerify";
import { upload, ALLOWED_UPLOAD, MAX_UPLOAD_BYTES } from "@/adapters/storage";
import { cancellation, type CancelBy, type CancelPolicy } from "@/domain/cancellation";
import { estimatedEnd } from "@/domain/quotes";
import { checkSlip } from "@/domain/slip";
import { canTransition, type BookingStatus, type TransitionActor } from "@/domain/transitions";
import { isLocale, messages, type Locale } from "@/i18n";
import type { SessionUser } from "@/lib/auth";
import { encryptField, normalizeThaiPhone, phoneHash } from "@/lib/crypto";
import { pool, SYSTEM, withTx, type Actor, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { formatBaht } from "@/lib/money";
import { log } from "@/lib/redact";
import { getSettings } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { enqueue } from "./outbox";
import { dispatchNext, driverLink } from "./dispatch";
import { bookingSource } from "./ads";

// FR-BOOK-03/06, FR-PAY-01..06 · §6 state machine (เปลี่ยนสถานะผ่านฟังก์ชันเดียว)

const appUrl = () => process.env.APP_URL ?? "http://localhost:3000";
export const customerLink = (path: string) =>
  process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER
    ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER}${path}`
    : `${appUrl()}/liff/customer${path}`;

const isStaff = (u: SessionUser) => u.role === "sales_admin" || u.role === "owner";

/** AC-7.1: บันทึกความพยายามเปลี่ยนสถานะที่ไม่ผ่าน (นอก transaction หลักซึ่งจะ rollback) */
export async function auditRejectedTransition(bookingId: string, from: string, to: string, actor: string, actorId?: string) {
  await pool.query(
    `insert into audit_logs (actor_id, actor_role, action, entity, entity_id, before, after, reason)
     values ($1, $2, 'TRANSITION_REJECTED', 'bookings', $3, $4, $5, 'invalid transition')`,
    [actorId ?? null, actor, bookingId, { status: from }, { status: to }],
  ).catch(() => {});
}

// ───────────── §6.4 transition: ล็อกแถว → ตรวจสิทธิ์ผู้กระทำ → DB trigger ตรวจซ้ำ ─────────────
export async function transition(db: Db, bookingId: string, to: BookingStatus, actor: TransitionActor,
                                 patch: Record<string, unknown> = {}) {
  const { rows } = await db.query(`select id, status from bookings where id = $1 for update`, [bookingId]);
  const b = rows[0];
  if (!b) throw new BizError("NOT_FOUND");
  if (!canTransition(b.status, to, actor)) {
    await auditRejectedTransition(bookingId, b.status, to, actor);
    throw new BizError("INVALID_TRANSITION", { from: b.status, to });
  }
  const keys = Object.keys(patch);
  await db.query(
    `update bookings set status = $2${keys.map((k, i) => `, ${k} = $${i + 3}`).join("")} where id = $1`,
    [bookingId, to, ...keys.map((k) => patch[k])],
  );
  return b.status as BookingStatus;
}

/** ส่งข้อความ LINE ถึงผู้ใช้ · ส่งฟังก์ชัน (ภาษา → ข้อความ) เพื่อให้ลูกค้าได้รับตามภาษาในบัญชี (users.locale) */
export async function notifyUser(db: Db, userId: string, text: string | ((locale: Locale) => string), dedupe: string) {
  const { rows } = await db.query(`select line_user_id, locale from users where id = $1`, [userId]);
  const locale: Locale = isLocale(rows[0]?.locale) ? rows[0].locale : "th";
  const body = typeof text === "function" ? text(locale) : text;
  if (rows[0]?.line_user_id) await enqueue(db, "line.push", { to: rows[0].line_user_id, messages: [{ type: "text", text: body }] }, dedupe);
}

export async function notifyRoles(db: Db, roles: string[], text: string, dedupe: string) {
  const { rows } = await db.query(
    `select id, line_user_id from users where role = any($1) and status = 'active' and line_user_id is not null`, [roles]);
  for (const r of rows) await enqueue(db, "line.push", { to: r.line_user_id, messages: [{ type: "text", text }] }, `${dedupe}:${r.id}`);
}

// ───────────── FR-BOOK-03 + FR-PAY-01: ยอมรับใบเสนอราคา → booking + QR มัดจำ ─────────────
export type AcceptInput = {
  terms_version: string;
  privacy_version: string;
  marketing_tracking: boolean;
  vehicle_liability?: boolean;
  full_name: string;
  phone: string;
};

export async function acceptQuote(user: SessionUser, quoteId: string, input: AcceptInput, ip: string | null) {
  const s = await getSettings();
  const terms = s.customer_terms as { terms_version: string; privacy_version: string };
  // จ่ายมัดจำไม่ได้ถ้ายังไม่ยอมรับ version ล่าสุด
  if (input.terms_version !== terms.terms_version || input.privacy_version !== terms.privacy_version) {
    throw new BizError("VALIDATION", { reason: "TERMS_OUTDATED", current: terms });
  }
  const e164 = normalizeThaiPhone(input.phone);
  if (!e164) throw new BizError("VALIDATION", { field: "phone" });
  const adapter = (s.payment_adapter as AdapterName) ?? "slip";
  const windowMin = Number(s.deposit_window_minutes ?? 120);
  const balanceDue = (s.balance_due as Record<string, string> | undefined) ?? {};

  return withTx({ userId: user.id, role: user.role, reason: "accept quote" }, async (db) => {
    const { rows } = await db.query(
      `select * from quotes where id = $1 and customer_id = $2 for update`, [quoteId, user.id]);
    const q = rows[0];
    if (!q) throw new BizError("NOT_FOUND");
    const dup = await db.query(`select id from bookings where quote_id = $1`, [quoteId]);
    if (dup.rows[0]) throw new BizError("INVALID_TRANSITION", { reason: "ALREADY_ACCEPTED", booking_id: dup.rows[0].id });
    if (q.status !== "sent") throw new BizError("INVALID_TRANSITION", { reason: q.status });
    if (new Date(q.expires_at) <= new Date()) throw new BizError("QUOTE_EXPIRED");
    if (q.car_type === "driver_only" && !input.vehicle_liability) throw new BizError("VALIDATION", { field: "vehicle_liability" });

    // ข้อมูลติดต่อ (ไว้ให้คนขับขอดูตามช่วงเวลา §5.3) — เข้ารหัส
    await db.query(`update users set full_name_enc = $2, phone_enc = $3, phone_hash = $4 where id = $1`,
      [user.id, encryptField(input.full_name), encryptField(e164), phoneHash(e164)]);

    const consents: [string, string, boolean][] = [
      ["terms", terms.terms_version, true],
      ["privacy", terms.privacy_version, true],
      ["marketing_tracking", terms.privacy_version, input.marketing_tracking],
    ];
    if (q.car_type === "driver_only") consents.push(["vehicle_liability", terms.terms_version, true]);
    for (const [kind, version, granted] of consents) {
      await db.query(`insert into consents (user_id, kind, version, granted, channel, meta) values ($1,$2,$3,$4,'liff',$5)`,
        [user.id, kind, version, granted, { ip, quote_id: quoteId }]);
    }

    await db.query(`update quotes set status = 'accepted' where id = $1`, [quoteId]);
    const depositSatang = Math.max(1, Math.round(Number(q.final_satang) * Number(s.deposit_pct ?? 0.3)));
    const end = estimatedEnd(new Date(q.pickup_at).toISOString(), q.duration_s ?? 0, q.hours);
    // FR-ADS-03: ทุกงานมีที่มา (ไม่มีค่าว่าง)
    const src = await bookingSource(db, q.last_touch_id, q.source_answer);
    const { rows: b } = await db.query(
      `insert into bookings (quote_id, customer_id, service_type, car_type, pickup_at, est_end_at, price_satang,
                             deposit_satang, balance_due, terms_version, terms_accepted_at, first_touch_id, last_touch_id,
                             source_platform, campaign_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10, now(), $11, $12, $13, $14) returning id`,
      [quoteId, user.id, q.service_type, q.car_type, q.pickup_at, end, q.final_satang, depositSatang,
       balanceDue[q.service_type] ?? balanceDue.default ?? "before_start", terms.terms_version, q.first_touch_id, q.last_touch_id,
       src.platform, src.campaignId],
    );
    const bookingId = b[0].id as string;
    const payment = await openPayment(db, bookingId, "deposit", depositSatang, adapter, windowMin);
    return { booking_id: bookingId, status: "awaiting_deposit", payment };
  });
}

/** สร้างรายการรับเงิน (pending) + charge ของ adapter */
async function openPayment(db: Db, bookingId: string, kind: "deposit" | "balance", amount: number,
                           adapter: AdapterName, windowMin: number) {
  const id = randomUUID();
  const charge = await createCharge(adapter, { paymentId: id, bookingId, amountSatang: amount, windowMinutes: windowMin });
  await db.query(
    `insert into payments (id, booking_id, kind, method, amount_satang, status, gateway_ref, expires_at, raw)
     values ($1,$2,$3,$4,$5,'pending',$6,$7,$8)`,
    [id, bookingId, kind, charge.method, amount, charge.gatewayRef, charge.expiresAt,
     charge.qrImageUrl ? { qr_image_url: charge.qrImageUrl } : null],
  );
  return { id, method: charge.method, amount_satang: amount, expires_at: charge.expiresAt, qr_image_url: charge.qrImageUrl };
}

/** FR-PAY-04: เปิดรายการยอดคงเหลือ (QR ใหม่) */
export async function openBalance(user: SessionUser, bookingId: string) {
  const s = await getSettings();
  return withTx({ userId: user.id, role: user.role, reason: "open balance payment" }, async (db) => {
    const { rows } = await db.query(
      `select b.id, b.customer_id, b.status, b.price_satang,
              coalesce((select sum(amount_satang) from payments p where p.booking_id = b.id
                         and p.kind in ('deposit','balance') and p.status = 'verified'), 0) as paid
         from bookings b where b.id = $1 for update`, [bookingId]);
    const b = rows[0];
    if (!b || (b.customer_id !== user.id && !isStaff(user))) throw new BizError("NOT_FOUND");
    if (!["confirmed", "assigned", "en_route", "arrived", "picked_up", "dropped_off", "completed"].includes(b.status)) {
      throw new BizError("INVALID_TRANSITION");
    }
    const due = Number(b.price_satang) - Number(b.paid);
    if (due <= 0) throw new BizError("INVALID_TRANSITION", { reason: "NOTHING_DUE" });
    const open = await db.query(`select id from payments where booking_id = $1 and kind = 'balance' and status in ('pending','pending_approval')`, [bookingId]);
    if (open.rows[0]) return { id: open.rows[0].id as string, reused: true };
    return openPayment(db, bookingId, "balance", due, (s.payment_adapter as AdapterName) ?? "slip", Number(s.deposit_window_minutes ?? 120));
  });
}

// ───────────── รับเงินสำเร็จ → ใบเสร็จ → (มัดจำ) ยืนยันงาน ─────────────
async function issueReceipt(db: Db, paymentId: string) {
  const exists = await db.query(`select id from receipts where payment_id = $1`, [paymentId]);
  if (exists.rows[0]) return exists.rows[0].id as string;
  const { rows } = await db.query(
    `select p.amount_satang, q.tax_category from payments p join bookings b on b.id = p.booking_id
       join quotes q on q.id = b.quote_id where p.id = $1`, [paymentId]);
  const { rows: r } = await db.query(
    `insert into receipts (number, payment_id, amount_satang, tax_category, is_tax_invoice)
     values (next_number('R'), $1, $2, $3, $4) returning id, number`,
    // FR-PAY-07 ใบกำกับภาษีเฉพาะเมื่อจด VAT (เฟส 3 ของ Req) — ตอนนี้ออกเป็นใบเสร็จเสมอ
    [paymentId, rows[0].amount_satang, rows[0].tax_category, false],
  );
  return r[0].id as string;
}

/** idempotent: เรียกซ้ำกับรายการที่ verified แล้วไม่มีผล */
async function markVerified(db: Db, paymentId: string, patch: { method?: string; slipRef?: string | null; raw?: unknown;
                                                                 approvedBy?: string | null; verifiedBy?: string | null }) {
  const { rows } = await db.query(`select id, booking_id, kind, status, amount_satang from payments where id = $1 for update`, [paymentId]);
  const p = rows[0];
  if (!p) throw new BizError("NOT_FOUND");
  if (p.status === "verified") return { already: true, bookingId: p.booking_id as string };
  if (!["pending", "pending_approval"].includes(p.status)) throw new BizError("INVALID_TRANSITION");
  await db.query(
    `update payments set status = 'verified', method = coalesce($2::payment_method, method), slip_ref = coalesce($3, slip_ref),
            raw = coalesce($4, raw), approved_by = coalesce($5, approved_by), verified_by = coalesce($6, verified_by), reason = null
      where id = $1`,
    [paymentId, patch.method ?? null, patch.slipRef ?? null, patch.raw ?? null, patch.approvedBy ?? null, patch.verifiedBy ?? null],
  );
  const receiptId = await issueReceipt(db, paymentId);

  const { rows: bk } = await db.query(`select id, status, customer_id, driver_id, pickup_at, price_satang from bookings where id = $1`, [p.booking_id]);
  const b = bk[0];
  const amount = formatBaht(Number(p.amount_satang));
  if (p.kind === "deposit" && b.status === "awaiting_deposit") {
    await transition(db, b.id, "confirmed", "system");
    // §6.3: แจ้งลูกค้า + แอดมิน · เริ่ม dispatch (เฟส 5) · conversion Purchase (เฟส 6)
    await notifyUser(db, b.customer_id,
      (l) => messages(l).line.confirmed(amount, formatBangkok(b.pickup_at, l), customerLink(`/receipts/${receiptId}`)),
      `confirmed:${b.id}`);
    await notifyRoles(db, ["sales_admin", "owner"], `[งานใหม่] ยืนยันมัดจำ ${amount} · ${formatBangkok(b.pickup_at)}`, `confirmed-staff:${b.id}`);
    await dispatchNext(db, b.id);
  } else {
    await notifyUser(db, b.customer_id, (l) => messages(l).line.paid(amount, customerLink(`/receipts/${receiptId}`)), `paid:${paymentId}`);
    // จ่ายครบแล้ว → แจ้งคนขับที่รับงานนี้ (ไม่ต้องเก็บเงินหน้างาน) · ยังไม่มีคนขับ = ไม่ต้องแจ้ง
    if (p.kind === "balance" && b.driver_id) {
      const { rows: t } = await db.query(
        `select coalesce(sum(amount_satang), 0)::bigint as paid from payments
          where booking_id = $1 and kind in ('deposit','balance') and status = 'verified'`, [b.id]);
      if (Number(t[0].paid) >= Number(b.price_satang)) {
        await notifyUser(db, b.driver_id,
          `ลูกค้าชำระยอดครบแล้ว ✓
งาน ${formatBangkok(b.pickup_at)}
ไม่ต้องเก็บเงินหน้างาน
ดูงาน: ${driverLink(`/jobs/${b.id}`)}`,
          `balance-paid-driver:${b.id}`);
      }
    }
  }
  return { already: false, bookingId: b.id as string, receiptId };
}

// ───────────── adapter ข: ลูกค้าส่งสลิป ─────────────
export async function submitSlip(user: SessionUser, paymentId: string, input: { file?: File; qrPayload?: string }) {
  const s = await getSettings();
  const company = s.company as { accounts: string[] };
  const { rows } = await pool.query(
    `select p.id, p.status, p.kind, p.amount_satang, p.method, p.created_at, b.customer_id
       from payments p join bookings b on b.id = p.booking_id where p.id = $1`, [paymentId]);
  const p = rows[0];
  if (!p || p.customer_id !== user.id) throw new BizError("NOT_FOUND");
  if (p.method !== "slip" || !["pending", "pending_approval"].includes(p.status)) throw new BizError("INVALID_TRANSITION");

  // §8.3 rate limit 10 / ชม. / รายการ (นับจาก audit ของ payments)
  const { rows: cnt } = await pool.query(
    `select count(*)::int as n from audit_logs where entity = 'payments' and entity_id = $1 and reason = 'slip submitted'
        and at > now() - interval '1 hour'`, [paymentId]);
  if (cnt[0].n >= Number(s.slip_rate_limit_per_hour ?? 10)) throw new BizError("RATE_LIMITED");

  let filePath: string | null = null;
  if (input.file) {
    const ext = ALLOWED_UPLOAD[input.file.type as keyof typeof ALLOWED_UPLOAD];
    if (!ext || ext === "pdf") throw new BizError("VALIDATION", { file: "type" });
    if (input.file.size > MAX_UPLOAD_BYTES) throw new BizError("VALIDATION", { file: "size" });
    filePath = `slips/${paymentId}/${randomUUID()}.${ext}`;
    await upload("receipts", filePath, await input.file.arrayBuffer(), input.file.type);
  }

  let slip;
  try {
    slip = await readSlip({ image: input.file, qrPayload: input.qrPayload });
  } catch (e) {
    if (!(e instanceof SlipProviderUnavailable)) log.warn("slip read failed", { error: (e as Error).message });
    slip = null;
  }

  return withTx({ userId: user.id, role: user.role, reason: "slip submitted" }, async (db) => {
    if (!slip) {
      // ตรวจอัตโนมัติไม่ได้ → รอแอดมินตรวจ + เจ้าของอนุมัติ (FR-PAY-03)
      await db.query(`update payments set status = 'pending_approval', reason = 'MANUAL_REVIEW', slip_file_path = coalesce($2, slip_file_path) where id = $1`,
        [paymentId, filePath]);
      await notifyRoles(db, ["owner"], `[สลิปรอตรวจ] ${formatBaht(Number(p.amount_satang))} — ตรวจในหลังบ้าน`, `slip-review:${paymentId}:${filePath ?? "payload"}`);
      return { status: "pending_approval", reason: "MANUAL_REVIEW" };
    }
    const used = await db.query(`select 1 from payments where slip_ref = $1 and id <> $2`, [slip.ref, paymentId]);
    const reason = checkSlip(slip, {
      amountSatang: Number(p.amount_satang), companyAccounts: company.accounts ?? [],
      notBefore: new Date(p.created_at), refAlreadyUsed: !!used.rows[0],
    });
    const raw = { ref: slip.ref, amount_satang: slip.amountSatang, receiver: slip.receiverAccounts, transferred_at: slip.transferredAt };
    if (reason) {
      await db.query(`update payments set status = 'pending_approval', reason = $2, raw = $3, slip_file_path = coalesce($4, slip_file_path) where id = $1`,
        [paymentId, reason, raw, filePath]);
      await notifyRoles(db, ["owner"], `[สลิปไม่ผ่าน: ${reason}] ${formatBaht(Number(p.amount_satang))} — ตรวจในหลังบ้าน`, `slip-bad:${paymentId}:${slip.ref}`);
      return { status: "pending_approval", reason };
    }
    if (filePath) await db.query(`update payments set slip_file_path = $2 where id = $1`, [paymentId, filePath]);
    await markVerified(db, paymentId, { slipRef: slip.ref, raw });
    return { status: "verified", reason: null };
  });
}

// ───────────── adapter ก: Omise webhook — ดึง charge ยืนยันเอง ─────────────
export async function handleOmiseCharge(chargeId: string) {
  const charge = await getCharge(chargeId);
  return withTx({ ...SYSTEM, reason: "omise webhook" }, async (db) => {
    const { rows } = await db.query(`select id, amount_satang, status from payments where gateway_ref = $1`, [charge.id]);
    const p = rows[0];
    if (!p) return { ignored: "unknown charge" };
    if (charge.status === "successful" && charge.currency.toLowerCase() === "thb" && charge.amount === Number(p.amount_satang)) {
      const r = await markVerified(db, p.id, { raw: { charge_id: charge.id, status: charge.status } });
      return { verified: true, already: r.already };
    }
    if (["failed", "expired"].includes(charge.status) && p.status === "pending") {
      await db.query(`update payments set status = 'failed', reason = $2 where id = $1`, [p.id, `GATEWAY_${charge.status.toUpperCase()}`]);
    }
    return { verified: false, status: charge.status };
  });
}

// ───────────── FR-PAY-03: ยืนยันด้วยมือ — sales_admin ขอ · owner อนุมัติ ─────────────
export async function requestManualApproval(staff: SessionUser, paymentId: string, note: string) {
  await withTx({ userId: staff.id, role: staff.role, reason: `request approval: ${note}` }, async (db) => {
    const { rowCount } = await db.query(
      `update payments set status = 'pending_approval', requested_by = $2, reason = coalesce(reason, 'MANUAL_REVIEW')
        where id = $1 and status in ('pending','pending_approval') and kind <> 'refund'`, [paymentId, staff.id]);
    if (!rowCount) throw new BizError("INVALID_TRANSITION");
    await notifyRoles(db, ["owner"], `[ขออนุมัติยืนยันเงิน] โดย ${staff.displayName}: ${note}`, `manual-req:${paymentId}`);
  });
}

export async function decidePayment(owner: SessionUser, paymentId: string, approve: boolean, reason: string) {
  return withTx({ userId: owner.id, role: owner.role, reason }, async (db) => {
    if (!approve) {
      const { rowCount } = await db.query(
        `update payments set status = 'failed', reason = $2 where id = $1 and status in ('pending','pending_approval')`, [paymentId, `REJECTED: ${reason}`]);
      if (!rowCount) throw new BizError("INVALID_TRANSITION");
      return { status: "failed" };
    }
    // method = manual → trigger บังคับว่า approved_by ต้องเป็น owner
    const r = await markVerified(db, paymentId, { method: "manual", approvedBy: owner.id });
    return { status: "verified", already: r.already };
  });
}

// ───────────── FR-BOOK-06 / FR-PAY-05: ยกเลิก + คืนเงิน ─────────────
async function moneyOf(db: Pick<Db, "query">, bookingId: string) {
  const { rows } = await db.query(
    `select b.id, b.status, b.customer_id, b.pickup_at, b.wait_minutes,
            coalesce(sum(p.amount_satang) filter (where p.kind = 'deposit' and p.status = 'verified'), 0)::bigint as dep,
            coalesce(sum(p.amount_satang) filter (where p.kind = 'balance' and p.status = 'verified'), 0)::bigint as bal
       from bookings b left join payments p on p.booking_id = b.id where b.id = $1 group by b.id`, [bookingId]);
  return rows[0];
}

export async function cancellationPreview(user: SessionUser, bookingId: string, by: CancelBy = "customer") {
  const b = await moneyOf(pool, bookingId);
  if (!b || (b.customer_id !== user.id && !isStaff(user))) throw new BizError("NOT_FOUND");
  const policy = (await getSettings()).cancellation_policy as CancelPolicy;
  const r = cancellation({ depositPaid: Number(b.dep), balancePaid: Number(b.bal), pickupAt: new Date(b.pickup_at) }, by, new Date(), policy);
  return { refund_satang: r.refund, driver_satang: r.driver, company_satang: r.company, rule: r.rule, paid_satang: Number(b.dep) + Number(b.bal) };
}

export async function cancelBooking(user: SessionUser, bookingId: string, by: CancelBy, reason: string) {
  if (by !== "customer" && user.role !== "owner") throw new BizError("FORBIDDEN");
  const policy = (await getSettings()).cancellation_policy as CancelPolicy;
  const actor: Actor = { userId: user.id, role: user.role, reason };
  return withTx(actor, async (db) => {
    await db.query(`select id from bookings where id = $1 for update`, [bookingId]);
    const b = await moneyOf(db, bookingId);
    if (!b || (b.customer_id !== user.id && user.role !== "owner")) throw new BizError("NOT_FOUND");
    const r = cancellation({ depositPaid: Number(b.dep), balancePaid: Number(b.bal), pickupAt: new Date(b.pickup_at) }, by, new Date(), policy);
    const who = by === "customer" ? "customer" : "owner";
    await transition(db, bookingId, "cancelled", who, {
      cancelled_by: by === "customer" ? "customer" : "company", cancel_reason: reason, cancelled_at: new Date(),
      refund_satang: r.refund, driver_share_satang: r.driver, cancel_rule: r.rule,
    });
    // รายการที่ยังไม่จ่าย → ยกเลิก · Omise charge ที่ค้างจะหมดอายุเอง
    await db.query(`update payments set status = 'failed', reason = 'BOOKING_CANCELLED' where booking_id = $1 and status in ('pending','pending_approval')`, [bookingId]);
    let refundId: string | null = null;
    if (r.refund > 0) {
      const { rows } = await db.query(
        `insert into payments (booking_id, kind, method, amount_satang, status, requested_by, reason)
         values ($1, 'refund', 'manual', $2, 'pending', $3, $4) returning id`,
        [bookingId, r.refund, user.id, r.rule]);
      refundId = rows[0].id;
      await notifyRoles(db, ["owner"], `[ต้องโอนคืน] ${formatBaht(r.refund)} (${r.rule}) — ${reason}`, `refund:${refundId}`);
    }
    await notifyUser(db, b.customer_id,
      (l) => messages(l).line.cancelled(r.refund > 0 ? formatBaht(r.refund) : null), `cancelled:${bookingId}`);
    // ปิด offer + แจ้งคนขับ (เฟส 5)
    return { status: "cancelled", refund_satang: r.refund, driver_satang: r.driver, rule: r.rule, refund_payment_id: refundId };
  });
}

/** owner โอนคืนแล้ว + แนบหลักฐาน */
export async function markRefundPaid(owner: SessionUser, paymentId: string, proof: File) {
  const ext = ALLOWED_UPLOAD[proof.type as keyof typeof ALLOWED_UPLOAD];
  if (!ext) throw new BizError("VALIDATION", { file: "type" });
  if (proof.size > MAX_UPLOAD_BYTES) throw new BizError("VALIDATION", { file: "size" });
  const path = `refunds/${paymentId}/${randomUUID()}.${ext}`;
  await upload("receipts", path, await proof.arrayBuffer(), proof.type);
  return withTx({ userId: owner.id, role: owner.role, reason: "refund transferred" }, async (db) => {
    const { rows } = await db.query(
      `update payments set status = 'refunded', proof_file_path = $2, refunded_at = now(), approved_by = $3
        where id = $1 and kind = 'refund' and status = 'pending' returning booking_id, amount_satang`, [paymentId, path, owner.id]);
    if (!rows[0]) throw new BizError("INVALID_TRANSITION");
    const { rows: b } = await db.query(`select customer_id from bookings where id = $1`, [rows[0].booking_id]);
    await notifyUser(db, b[0].customer_id, (l) => messages(l).line.refunded(formatBaht(Number(rows[0].amount_satang))), `refunded:${paymentId}`);
    return { status: "refunded" };
  });
}

// ───────────── §10 expire_unpaid ─────────────
export async function expireUnpaid() {
  const minutes = Number((await getSettings()).deposit_window_minutes ?? 120);
  return withTx({ ...SYSTEM, reason: "expire_unpaid job" }, async (db) => {
    // สลิปที่รอตรวจด้วยมือไม่หมดอายุ — ลูกค้าจ่ายแล้วแต่ระบบตรวจไม่ได้
    const { rows } = await db.query(
      `select id, customer_id from bookings b
        where status = 'awaiting_deposit' and created_at < now() - make_interval(mins => $1)
          and not exists (select 1 from payments p where p.booking_id = b.id and p.status = 'pending_approval')
        for update skip locked`, [minutes]);
    for (const b of rows) {
      await transition(db, b.id, "expired", "system");
      await db.query(`update payments set status = 'failed', reason = 'EXPIRED' where booking_id = $1 and status = 'pending'`, [b.id]);
      await notifyUser(db, b.customer_id, (l) => messages(l).line.expired, `expired:${b.id}`);
    }
    return { expired: rows.length };
  });
}
