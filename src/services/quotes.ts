import "server-only";
import { quoteFlex } from "@/adapters/line/flex";
import { DEFAULT_ESTIMATE, estimateRoute, inThailand, type EstimateConfig } from "@/domain/geo";
import { PricingError, checkDiscount, depositFor, extrasFor, price, type Extras, type PriceRule } from "@/domain/pricing";
import {
  CHARTER_SERVICES, QUOTE_EXCLUDES, QUOTE_INCLUDES, normalizeFlightNo, validateQuoteRequest,
  type Place, type QuoteRequest, type ServiceType,
} from "@/domain/quotes";
import { isLocale, messages, type Locale } from "@/i18n";
import type { SessionUser } from "@/lib/auth";
import { pool, SYSTEM, withTx, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { getSettings, type CatalogSettings } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { enqueue } from "./outbox";
import { invalidateCatalog } from "./catalog";
import { touchesFor } from "./ads";
import { reverseGeocode } from "@/adapters/maps/reverse";

// FR-PRICE-01, FR-QUOTE-01/02/04, BR-QUOTE-01..03
// ตำแหน่งมาจากลูกค้า (GPS / ปักหมุด / ลิงก์ Google Maps) · ระยะทาง = ประมาณจากพิกัด (domain/geo) ไม่เรียก API แผนที่

export type PointInput = { lat: number; lng: number; name?: string; source: "gps" | "pin" | "link" };

export type CreateQuoteInput = {
  customer_id?: string;                 // staff สร้างแทนลูกค้า
  service_type: ServiceType;
  car_type: string;
  origin?: PointInput;
  destination?: PointInput;
  stops: PointInput[];
  pickup_at: string;
  hours?: number | null;
  pax: number;
  luggage: number;
  child_seats: number;
  flight?: { no?: string | null; airport: "BKK" | "DMK"; direction: "arrival" | "departure" } | null;
  no_flight: boolean;
  notes?: string | null;
  source_answer?: string | null;
  manual?: { distance_km: number; duration_min: number } | null;   // staff เท่านั้น (ระยะจริงต่างจากที่ประมาณมาก)
};

type Airport = { name: string; lat: number; lng: number };

/** พิกัดต้องอยู่ในไทย · ไม่มีชื่อ = แสดงพิกัดแทน (คนขับนำทางจากพิกัดเสมอ) */
function toPlace(p: PointInput | undefined): Place | null {
  if (!p) return null;
  if (!inThailand(p)) throw new BizError("VALIDATION", { field: "place", problem: "outside_thailand" });
  const lat = Math.round(p.lat * 1e6) / 1e6;
  const lng = Math.round(p.lng * 1e6) / 1e6;
  const name = p.name?.trim() || `📍 ${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  return { name, lat, lng, source: p.source };
}

async function activeRule(db: Db, car: string, service: string): Promise<(PriceRule & { tax_category: string }) | null> {
  const { rows } = await db.query(
    `select id, base_satang::int, included_km, per_km_satang::int, included_minutes, ot_per_hour_satang::int,
            floor_satang::int, tax_category
       from price_rules
      where car_type = $1 and service_type = $2 and active_from <= now() and (active_to is null or active_to > now())`,
    [car, service],
  );
  return rows[0] ?? null;
}

export async function createQuote(actor: SessionUser, input: CreateQuoteInput) {
  const staff = actor.role === "sales_admin" || actor.role === "owner";
  const customerId = staff ? input.customer_id : actor.id;
  if (!customerId) throw new BizError("VALIDATION", { field: "customer_id" });
  if (!staff && input.manual) throw new BizError("FORBIDDEN");

  const s = await getSettings();
  const catalog = s.catalog as CatalogSettings;
  const airports = s.airports as Record<"BKK" | "DMK", Airport>;

  // §8.3 rate limit ลูกค้า (กันสแปมใบเสนอราคา)
  if (!staff) {
    const { rows } = await pool.query(
      `select count(*)::int as n from quotes where created_by = $1 and created_at > now() - interval '1 hour'`, [actor.id]);
    if (rows[0].n >= Number(s.quote_rate_limit_per_hour ?? 10)) throw new BizError("RATE_LIMITED");
  }

  // ─── สถานที่: ฝั่งสนามบินใช้พิกัดจาก settings เสมอ (ไม่เชื่อค่าจาก client) ───
  let origin = toPlace(input.origin);
  let destination = toPlace(input.destination);
  let stops = input.stops.map((p) => toPlace(p)!);
  if (input.service_type === "airport_transfer" && input.flight) {
    const ap = airports[input.flight.airport];
    if (!ap) throw new BizError("VALIDATION", { field: "airport" });
    const airport: Place = { name: ap.name, lat: ap.lat, lng: ap.lng, source: "airport" };
    if (input.flight.direction === "arrival") origin = airport;
    else destination = airport;
  }
  // ลูกค้าไม่ได้ตั้งชื่อจุด → หาชื่อสถานที่จากพิกัด (OSM) ให้คนขับอ่านง่าย · หาไม่ได้ = แสดงพิกัดตามเดิม
  const named = async (pl: Place | null): Promise<Place | null> => {
    if (!pl || pl.source === "airport" || !pl.name.startsWith("📍") || pl.lat == null || pl.lng == null) return pl;
    const name = await reverseGeocode({ lat: pl.lat, lng: pl.lng });
    return name ? { ...pl, name } : pl;
  };
  origin = await named(origin);
  destination = await named(destination);
  const namedStops: Place[] = [];
  for (const st of stops) namedStops.push((await named(st))!);
  stops = namedStops;
  if (!origin) throw new BizError("VALIDATION", { field: "origin" });

  const req: QuoteRequest = {
    service_type: input.service_type,
    car_type: input.car_type,
    origin, destination, stops,
    pickup_at: input.pickup_at,
    hours: CHARTER_SERVICES.includes(input.service_type) ? input.hours ?? null : null,
    pax: input.pax, luggage: input.luggage, child_seats: input.child_seats,
    flight: input.flight ? { no: input.flight.no ? normalizeFlightNo(input.flight.no) : null, airport: input.flight.airport, direction: input.flight.direction } : null,
    no_flight: input.no_flight,
  };
  const car = catalog.cars[input.car_type];
  const errors = validateQuoteRequest(req, { seats: car?.seats, luggage: car?.luggage }, new Date(),
    staff ? 0 : Number(s.quote_min_lead_minutes ?? 120));
  const allowedHours = (s.charter_hours as Record<string, number[]> | undefined)?.[input.service_type];
  if (req.hours && allowedHours && !staff && !allowedHours.includes(req.hours)) errors.push("HOURS_REQUIRED");
  if (errors.length) throw new BizError("QUOTE_RULE", { errors });

  // ─── ระยะทาง ───
  const points = [origin, ...stops, ...(destination ? [destination] : [])];
  const estimate = { ...DEFAULT_ESTIMATE, ...(s.route_estimate as Partial<EstimateConfig> | undefined) };
  const route = input.manual
    ? { distanceM: Math.round(input.manual.distance_km * 1000), durationS: Math.round(input.manual.duration_min * 60) }
    : estimateRoute(points as { lat: number; lng: number }[], estimate);
  const source = input.manual ? "manual" : "estimate";

  return withTx({ userId: actor.id, role: actor.role, reason: "create quote" }, async (db) => {
    if (staff) {
      const c = await db.query(`select 1 from users where id = $1 and role in ('customer','corporate_customer') and status = 'active'`, [customerId]);
      if (!c.rows[0]) throw new BizError("VALIDATION", { field: "customer_id" });
    }
    const rule = await activeRule(db, input.car_type, input.service_type);
    if (!rule) throw new BizError("NO_PRICE_RULE");
    const breakdown = price({
      rule, distanceM: route.distanceM, durationS: route.durationS, hours: req.hours ?? undefined,
      extrasSatang: extrasFor(s.extras as Extras, req.child_seats, stops.length),
    });
    const ttl = Number(s.quote_ttl_hours ?? 24);
    // §7.7 ข้อ 4: first/last touch ของลูกค้าในช่วง attribution_days
    const touches = await touchesFor(db, customerId);
    const { rows: n } = await db.query(`select next_number('Q') as number`);
    const { rows } = await db.query(
      `insert into quotes (number, customer_id, created_by, service_type, car_type, origin, stops, destination, pickup_at,
                           hours, pax, luggage, child_seats, flight_no, airport, flight_direction, no_flight,
                           distance_m, duration_s, distance_source, price_rule_id, breakdown, computed_satang, final_satang,
                           tax_category, status, expires_at, notes, source_answer, first_touch_id, last_touch_id)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$23,$24,'sent',
               now() + make_interval(hours => $25), $26, $27, $28, $29)
       returning id, number, revision, final_satang::int, expires_at`,
      [n[0].number, customerId, actor.id, input.service_type, input.car_type, origin, JSON.stringify(stops), destination,
       input.pickup_at, req.hours, req.pax, req.luggage, req.child_seats, req.flight?.no ?? null,
       req.flight?.airport ?? null, req.flight?.direction ?? null, req.no_flight,
       route.distanceM, route.durationS, source, rule.id, breakdown, breakdown.computed, rule.tax_category, ttl,
       input.notes ?? null, input.source_answer ?? null, touches.first, touches.last],
    );
    const q = rows[0];
    await notifyCustomer(db, q.id);
    return {
      ...q,
      breakdown,
      deposit_satang: depositFor(q.final_satang, Number(s.deposit_pct ?? 0.3)),
      tax_category: rule.tax_category,
      includes: QUOTE_INCLUDES,
      excludes: QUOTE_EXCLUDES,
    };
  });
}

/** FR-QUOTE-01: ส่ง Flex Message ใน LINE (ผ่าน outbox) */
async function notifyCustomer(db: Db, quoteId: string) {
  const { rows } = await db.query(
    `select q.id, q.number, q.revision, q.service_type, q.car_type, q.origin, q.destination, q.pickup_at,
            q.final_satang::int, q.expires_at, u.line_user_id, u.locale
       from quotes q join users u on u.id = q.customer_id where q.id = $1`,
    [quoteId],
  );
  const q = rows[0];
  if (!q?.line_user_id) return;
  const locale: Locale = isLocale(q.locale) ? q.locale : "th";
  const t = messages(locale);
  const { rows: d } = await db.query(`select value from settings where key = 'deposit_pct'`);
  const base = process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER
    ? `https://liff.line.me/${process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER}/quotes/${q.id}`
    : `${process.env.APP_URL ?? "http://localhost:3000"}/liff/customer/quotes/${q.id}`;
  await enqueue(db, "line.push", {
    to: q.line_user_id,
    messages: [quoteFlex({
      number: q.number, revision: q.revision,
      serviceLabel: t.service[q.service_type] ?? q.service_type, carLabel: t.car[q.car_type] ?? q.car_type,
      route: [q.origin?.name, q.destination?.name].filter(Boolean).join(" → "),
      pickupText: formatBangkok(q.pickup_at, locale), finalSatang: q.final_satang,
      depositSatang: depositFor(q.final_satang, Number(d[0]?.value ?? 0.3)),
      expiresText: formatBangkok(q.expires_at, locale), url: base,
    }, t.line)],
  }, `quote:${q.id}`);
}

async function notifyOwners(db: Db, text: string, dedupe: string) {
  const { rows } = await db.query(`select line_user_id from users where role = 'owner' and status = 'active' and line_user_id is not null`);
  for (const o of rows) await enqueue(db, "line.push", { to: o.line_user_id, messages: [{ type: "text", text }] }, `${dedupe}:${o.line_user_id}`);
}

/** FR-QUOTE-02 + BR-QUOTE-03: ส่วนลดหลังส่ง = revision ใหม่ · sales_admin เกินเพดาน → รอ owner */
export async function applyDiscount(actor: SessionUser, quoteId: string, discountSatang: number, reason: string) {
  if (actor.role !== "sales_admin" && actor.role !== "owner") throw new BizError("FORBIDDEN");
  const s = await getSettings();
  return withTx({ userId: actor.id, role: actor.role, reason }, async (db) => {
    const { rows } = await db.query(
      `select q.*, r.floor_satang::int as floor from quotes q join price_rules r on r.id = q.price_rule_id where q.id = $1 for update of q`,
      [quoteId],
    );
    const q = rows[0];
    if (!q) throw new BizError("NOT_FOUND");
    if (q.status !== "sent") throw new BizError("INVALID_TRANSITION");
    if (new Date(q.expires_at) <= new Date()) throw new BizError("QUOTE_EXPIRED");
    const pendingOther = await db.query(`select 1 from quotes where number = $1 and status = 'pending_approval'`, [q.number]);
    if (pendingOther.rows[0]) throw new BizError("INVALID_TRANSITION", { reason: "PENDING_APPROVAL_EXISTS" });

    let decision;
    try {
      decision = checkDiscount(Number(q.computed_satang), discountSatang, q.floor, actor.role as "sales_admin" | "owner", Number(s.admin_max_discount ?? 0.1));
    } catch (e) {
      if (e instanceof PricingError) throw new BizError(e.code, { floor_satang: q.floor });
      throw e;
    }
    const status = decision === "ok" ? "sent" : "pending_approval";
    const { rows: rev } = await db.query(
      `insert into quotes (number, revision, customer_id, created_by, service_type, car_type, origin, stops, destination,
                           pickup_at, return_at, hours, pax, luggage, child_seats, flight_no, airport, flight_direction,
                           no_flight, distance_m, duration_s, distance_source, price_rule_id, breakdown, computed_satang,
                           discount_satang, discount_reason, final_satang, tax_category, status, expires_at, notes,
                           source_answer, first_touch_id, last_touch_id, discount_requested_by)
       select number, (select max(revision) + 1 from quotes where number = q.number), customer_id, $2, service_type, car_type,
              origin, stops, destination, pickup_at, return_at, hours, pax, luggage, child_seats, flight_no, airport,
              flight_direction, no_flight, distance_m, duration_s, distance_source, price_rule_id, breakdown, computed_satang,
              $3, $4, computed_satang - $3, tax_category, $5,
              now() + make_interval(hours => $6), notes, source_answer, first_touch_id, last_touch_id, $2
         from quotes q where id = $1
       returning id, number, revision, status, final_satang::int`,
      [quoteId, actor.id, discountSatang, reason, status, Number(s.quote_ttl_hours ?? 24)],
    );
    const r = rev[0];
    if (status === "sent") {
      await db.query(`update quotes set status = 'superseded' where id = $1`, [quoteId]);
      await notifyCustomer(db, r.id);
    } else {
      await notifyOwners(db, `[ขออนุมัติส่วนลด] ${r.number} rev.${r.revision} ลด ${discountSatang / 100} บาท — ${reason}`, `discount:${r.id}`);
    }
    return r;
  });
}

export async function decideDiscount(owner: SessionUser, quoteId: string, approve: boolean, reason?: string) {
  return withTx({ userId: owner.id, role: owner.role, reason: reason ?? (approve ? "approve discount" : "reject discount") }, async (db) => {
    const { rows } = await db.query(`select id, number, status, expires_at from quotes where id = $1 for update`, [quoteId]);
    const q = rows[0];
    if (!q) throw new BizError("NOT_FOUND");
    if (q.status !== "pending_approval") throw new BizError("INVALID_TRANSITION");
    if (!approve) {
      await db.query(`update quotes set status = 'rejected' where id = $1`, [quoteId]);
      return { status: "rejected" };
    }
    if (new Date(q.expires_at) <= new Date()) throw new BizError("QUOTE_EXPIRED");
    await db.query(`update quotes set status = 'superseded' where number = $1 and status = 'sent'`, [q.number]);
    await db.query(`update quotes set status = 'sent' where id = $1`, [quoteId]);
    await notifyCustomer(db, quoteId);
    return { status: "sent" };
  });
}

/** §10 expire_quotes (ทุก 5 นาที) · FR-QUOTE-04 เตือนลูกค้า 2 ชม. ก่อนหมด */
export async function expireQuotes() {
  return withTx({ ...SYSTEM, reason: "expire_quotes job" }, async (db) => {
    const { rowCount: expired } = await db.query(
      `update quotes set status = 'expired' where status in ('sent','pending_approval') and expires_at <= now()`,
    );
    const { rows } = await db.query(
      `update quotes q set reminded_at = now()
         from users u
        where u.id = q.customer_id and q.status = 'sent' and q.reminded_at is null
          and q.expires_at > now() and q.expires_at <= now() + interval '2 hours'
        returning q.id, q.number, q.expires_at, u.line_user_id, u.locale`,
    );
    for (const r of rows) {
      if (!r.line_user_id) continue;
      await enqueue(db, "line.push", {
        to: r.line_user_id,
        messages: [{ type: "text", text: (() => {
          const l: Locale = isLocale(r.locale) ? r.locale : "th";
          return messages(l).line.quoteExpiring(r.number, formatBangkok(r.expires_at, l));
        })() }],
      }, `quote-remind:${r.id}`);
    }
    return { expired, reminded: rows.length };
  });
}

/** FR-PRICE-02: แก้ราคา = ปิดกฎเดิม + เพิ่มกฎใหม่ (ใบเสนอราคาเดิมไม่เปลี่ยน) */
export async function upsertPriceRule(owner: SessionUser, r: Omit<PriceRule, "id"> & {
  car_type: string; service_type: string; wait_per_hour_satang: number; free_wait_minutes: number; tax_category: string;
}, reason: string) {
  return withTx({ userId: owner.id, role: owner.role, reason }, async (db) => {
    await db.query(
      `update price_rules set active_to = now()
        where car_type = $1 and service_type = $2 and (active_to is null or active_to > now())`,
      [r.car_type, r.service_type],
    );
    const { rows } = await db.query(
      `insert into price_rules (car_type, service_type, base_satang, included_km, per_km_satang, included_minutes,
                                ot_per_hour_satang, wait_per_hour_satang, free_wait_minutes, floor_satang, tax_category, active_from)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now()) returning id`,
      [r.car_type, r.service_type, r.base_satang, r.included_km, r.per_km_satang, r.included_minutes,
       r.ot_per_hour_satang, r.wait_per_hour_satang, r.free_wait_minutes, r.floor_satang, r.tax_category],
    );
    invalidateCatalog();
    return rows[0].id as string;
  });
}

export async function deactivatePriceRule(owner: SessionUser, id: string, reason: string) {
  await withTx({ userId: owner.id, role: owner.role, reason }, async (db) => {
    const { rowCount } = await db.query(`update price_rules set active_to = now() where id = $1 and (active_to is null or active_to > now())`, [id]);
    if (!rowCount) throw new BizError("NOT_FOUND");
    invalidateCatalog();
  });
}
