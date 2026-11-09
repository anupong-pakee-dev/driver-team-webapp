// §17 ย้ายข้อมูลจาก Pilot (Google Sheet → CSV → staging → ตรวจ → production)
//
//   node --env-file=.env.local scripts/import-pilot.ts <โฟลเดอร์ CSV> [--apply] [--owner owner@example.com]
//
// ไฟล์ในโฟลเดอร์ (export จากชีต Pilot เป็น CSV UTF-8, หัวตารางตามเอกสาร 09 Pilot Plan):
//   drivers.csv  — ตาราง 1.3 คัดคนขับ   → users + drivers + ลิงก์เชิญ (คนขับต้อง login LINE + ยอมรับสัญญาฉบับระบบ + ส่งเอกสารใหม่)
//   vehicles.csv — ตาราง 1.2 คัดรถ      → vehicles (kyc = pending · owner ต้องอนุมัติเอกสารในระบบอีกครั้ง)
//   jobs.csv     — แท็บ jobs            → quotes + bookings (completed) + payments + payouts (paid) + reviews · ไม่ออกใบเสร็จย้อนหลัง
//   ads.csv      — แท็บ ads             → ad_spend (รายสัปดาห์ ไม่ระบุแคมเปญ)
// ไม่นำเข้า: ชื่อ/เบอร์ลูกค้า (ไม่มี consent ❓ ทนาย) → งานประวัติทั้งหมดผูกกับบัญชี "ลูกค้า Pilot" บัญชีเดียว (ถูกระงับ ใช้ทำรายงานเท่านั้น)
//            ตารางราคา → ให้เจ้าของตั้งใน /admin/prices (ชีต Pilot ไม่มี กม./ชม. ที่รวม)
// ค่าเริ่มเป็น dry-run: ตรวจทุกแถวแล้วรายงาน ไม่เขียนอะไร · --apply เขียนใน transaction เดียว (ผิดแถวเดียว = ไม่เขียนเลย)
// รันซ้ำได้เฉพาะงาน: งานที่เคยนำเข้า (booking_id เดิม) จะถูกข้าม · คนขับ/รถให้นำเข้าครั้งเดียว (ทะเบียนซ้ำ = ไม่ผ่านการตรวจ)
import { createHash, randomBytes } from "node:crypto";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { encryptField } from "../src/lib/crypto.ts";
import { driverInviteLink } from "../src/lib/links.ts";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--i-know-this-is-production")) {
  throw new Error("ซ้อมบน staging ก่อน — production ต้องใส่ --i-know-this-is-production");
}
const dir = process.argv[2];
const APPLY = process.argv.includes("--apply");
const ownerEmail = process.argv.includes("--owner") ? process.argv[process.argv.indexOf("--owner") + 1] : undefined;
if (!dir || !existsSync(dir)) throw new Error("usage: import-pilot.ts <csv-folder> [--apply] [--owner email]");

// ───────────── CSV (RFC 4180 + BOM) ─────────────
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows.filter((r) => r.some((x) => x.trim()));
  if (!head) return [];
  const keys = head.map((h) => h.trim());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}
const read = (f: string) => (existsSync(join(dir, f)) ? parseCsv(readFileSync(join(dir, f), "utf8")) : null);

// ───────────── แปลงค่า ─────────────
const problems: string[] = [];
const bad = (where: string, msg: string) => problems.push(`${where}: ${msg}`);
const yes = (v?: string) => /^(✅|☑|✓|true|yes|y|ใช่|ผ่าน|x)$/i.test(v ?? "");
const col = (r: Record<string, string>, ...names: string[]) => {
  for (const n of names) for (const k of Object.keys(r)) if (k.replace(/\s+/g, "").startsWith(n.replace(/\s+/g, ""))) return r[k];
  return "";
};
function baht(v: string): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[,฿\s]|บาท/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
/** "2026-11-20 06:30" · "20/11/2026 06:30" · "20/11/2569 06:30" (พ.ศ.) → ISO (เวลาไทย) */
function bkkDate(v: string): string | null {
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2}))?/.exec(v);
  let y: number, mo: number, d: number, h = 0, mi = 0;
  if (m) [y, mo, d, h, mi] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0"].map(Number) as [number, number, number, number, number];
  else {
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2})[:.](\d{2}))?/.exec(v);
    if (!m) return null;
    [d, mo, y, h, mi] = [m[1], m[2], m[3], m[4] ?? "0", m[5] ?? "0"].map(Number) as [number, number, number, number, number];
  }
  if (y > 2400) y -= 543;
  const iso = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}:00+07:00`;
  return Number.isNaN(Date.parse(iso)) ? null : iso;
}
function carType(v: string): string | null {
  const s = v.toLowerCase();
  if (/alphard|mpv/.test(s)) return "mpv_premium";
  if (/ตู้.*vip|vip.*ตู้|van.*vip/.test(s)) return "van_vip";
  if (/ตู้|van|commuter/.test(s)) return "van";
  if (/suv|7\s*ที่|fortuner|pajero/.test(s)) return "suv";
  if (/เก๋ง|sedan|altis|civic|camry/.test(s)) return "sedan";
  if (/คนขับอย่างเดียว|driver/.test(s)) return "driver_only";
  return null;
}
function service(v: string): string | null {
  if (/สนามบิน|airport/i.test(v)) return "airport_transfer";
  if (/ชม|hour/i.test(v)) return "hourly_charter";
  if (/รายวัน|ต่อวัน|\/วัน|daily/i.test(v)) return "daily_charter";
  if (/ต่างจังหวัด|a\s*→\s*b|point/i.test(v)) return "point_to_point";
  return null;
}
const PLATFORM: [RegExp, string][] = [[/fb|facebook|ig|instagram|meta/i, "meta"], [/google|gads|search/i, "google"],
  [/tiktok/i, "tiktok"], [/gbp|maps|business/i, "gbp"], [/friend|เพื่อน|แนะนำ|referral/i, "referral"],
  [/ป้าย|โบรชัวร์|qr|offline/i, "offline"], [/direct|line|ตรง/i, "direct"]];
const platform = (v: string) => PLATFORM.find(([re]) => re.test(v))?.[1] ?? "unknown";

// ───────────── อ่านไฟล์ ─────────────
const drivers = read("drivers.csv") ?? [];
const vehicles = read("vehicles.csv") ?? [];
const jobs = read("jobs.csv") ?? [];
const ads = read("ads.csv") ?? [];

type D = { no: string; name: string; vehicleNos: string[] };
const D_OK: D[] = [];
drivers.forEach((r, i) => {
  if (!yes(col(r, "✅", "ผ่าน"))) return;
  const name = col(r, "ชื่อ");
  if (!name) return bad(`drivers.csv แถว ${i + 2}`, "ไม่มีชื่อ");
  D_OK.push({ no: col(r, "#") || String(i + 1), name, vehicleNos: col(r, "ขับรถคันไหน").split(/[,\s]+/).filter(Boolean) });
});

type V = { no: string; plate: string; owner: string; car: string; seats: number; luggage: number };
const V_OK: V[] = [];
vehicles.forEach((r, i) => {
  if (!yes(col(r, "✅", "ผ่าน"))) return;
  const where = `vehicles.csv แถว ${i + 2}`;
  const car = carType(col(r, "ประเภทรถ"));
  const [seats, luggage] = col(r, "ที่นั่ง").split(/[\/,]/).map((x) => Number(x.replace(/\D/g, "")));
  const plate = col(r, "ทะเบียน").replace(/\s+/g, "").toUpperCase();
  if (!plate) return bad(where, "ไม่มีทะเบียน");
  if (!car || car === "driver_only") return bad(where, `ประเภทรถไม่รู้จัก "${col(r, "ประเภทรถ")}"`);
  if (!(seats >= 1 && seats <= 15) || !(luggage >= 0)) return bad(where, `ที่นั่ง/กระเป๋าไม่ถูกต้อง "${col(r, "ที่นั่ง")}"`);
  V_OK.push({ no: col(r, "#") || String(i + 1), plate, owner: col(r, "เจ้าของ"), car, seats, luggage });
});
const vehicleDriver = new Map<string, string>(); // vehicle # → driver name
for (const d of D_OK) for (const n of d.vehicleNos) vehicleDriver.set(n, d.name);
for (const v of V_OK) if (!vehicleDriver.has(v.no)) bad(`vehicles.csv คัน #${v.no} ${v.plate}`, "ไม่มีคนขับคนไหนระบุว่าขับคันนี้ (ตาราง 1.3 คอลัมน์ ขับรถคันไหน)");

type J = {
  id: string; contacted: string | null; src: string; service: string; pickup: string; origin: string; destination: string;
  pax: number; luggage: number; flight: string; car: string; quoted: number; discount: number; final: number;
  deposit: number; driver: string; plate: string; reimburse: number; driverPay: number | null; paidAt: string | null; rating: number | null; issue: string;
};
const J_OK: J[] = [];
const skipped: Record<string, number> = {};
jobs.forEach((r, i) => {
  const where = `jobs.csv แถว ${i + 2} (${col(r, "booking_id") || "?"})`;
  const stage = col(r, "stage").toLowerCase();
  if (stage !== "done") { skipped[stage || "ว่าง"] = (skipped[stage || "ว่าง"] ?? 0) + 1; return; }
  const svc = service(col(r, "บริการ")), car = carType(col(r, "ประเภทรถ")), pickup = bkkDate(col(r, "วันเวลางาน"));
  const final = baht(col(r, "ราคาสุดท้าย")), deposit = baht(col(r, "มัดจำ")) ?? 0;
  if (!svc) return bad(where, `บริการไม่รู้จัก "${col(r, "บริการ")}"`);
  if (!car) return bad(where, `ประเภทรถไม่รู้จัก "${col(r, "ประเภทรถ")}"`);
  if (!pickup) return bad(where, `วันเวลางานอ่านไม่ได้ "${col(r, "วันเวลางาน")}"`);
  if (!final || final <= 0) return bad(where, "ไม่มีราคาสุดท้าย");
  if (deposit <= 0 || deposit > final) return bad(where, "มัดจำต้อง > 0 และไม่เกินราคา");
  if (!col(r, "คนขับ")) return bad(where, "ไม่มีชื่อคนขับ");
  if (car !== "driver_only" && !col(r, "ทะเบียน")) return bad(where, "ไม่มีทะเบียน");
  const rating = Number(col(r, "รีวิว"));
  J_OK.push({
    id: col(r, "booking_id") || `row${i + 2}`, contacted: bkkDate(col(r, "วันที่ทัก")), src: col(r, "src"), service: svc, pickup,
    origin: col(r, "ต้นทาง") || "—", destination: col(r, "ปลายทาง"), pax: Number(col(r, "คน")) || 1,
    luggage: Number(col(r, "กระเป๋า")) || 0, flight: col(r, "เที่ยวบิน"), car,
    quoted: baht(col(r, "ราคาเสนอ")) ?? final, discount: baht(col(r, "ส่วนลด")) ?? 0, final, deposit,
    driver: col(r, "คนขับ"), plate: col(r, "ทะเบียน").replace(/\s+/g, "").toUpperCase(),
    reimburse: baht(col(r, "ทางด่วน")) ?? 0, driverPay: baht(col(r, "จ่ายคนขับ")), paidAt: bkkDate(col(r, "วันที่จ่าย")),
    rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null, issue: col(r, "ปัญหา"),
  });
});
const A_OK = ads.flatMap((r, i) => {
  const date = bkkDate(col(r, "สัปดาห์"))?.slice(0, 10), amount = baht(col(r, "เงินที่ใช้"));
  if (!date || amount === null) { bad(`ads.csv แถว ${i + 2}`, "สัปดาห์/เงินที่ใช้อ่านไม่ได้"); return []; }
  return [{ date, platform: platform(col(r, "ช่องทาง")), amount }];
});

// ───────────── รายงาน ─────────────
console.log(`\nPilot import ${APPLY ? "(APPLY)" : "(dry-run)"} — ${dir}`);
console.log(`  คนขับที่ผ่าน ${D_OK.length}/${drivers.length} · รถที่ผ่าน ${V_OK.length}/${vehicles.length} · งาน done ${J_OK.length}/${jobs.length} · แอด ${A_OK.length}/${ads.length}`);
if (Object.keys(skipped).length) console.log(`  งานที่ไม่นำเข้า (ไม่ใช่ done): ${JSON.stringify(skipped)} — ใช้ดูในชีตเดิม`);

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
try {
  const [owner] = (await db.query(
    ownerEmail
      ? `select u.id from users u join auth.users a on a.id = u.auth_user_id where a.email = $1 and u.role = 'owner'`
      : `select id from users where role = 'owner' and status = 'active' order by created_at limit 1`,
    ownerEmail ? [ownerEmail] : [])).rows;
  if (!owner) bad("owner", "ไม่พบบัญชีเจ้าของในระบบ (ต้องมีก่อน — ใช้อนุมัติรายการเงินย้อนหลัง)");

  const driverNames = new Set(D_OK.map((d) => d.name));
  const plates = new Set(V_OK.map((v) => v.plate));
  const existingPlates = new Set((await db.query(`select plate from vehicles`)).rows.map((r) => r.plate));
  for (const v of V_OK) if (existingPlates.has(v.plate)) bad(`vehicles.csv ${v.plate}`, "มีทะเบียนนี้ในระบบแล้ว");
  const rules = (await db.query(`select distinct on (car_type, service_type) id, car_type, service_type, tax_category
                                   from price_rules order by car_type, service_type, active_from desc`)).rows;
  for (const j of J_OK) {
    if (!driverNames.has(j.driver)) bad(`jobs.csv ${j.id}`, `คนขับ "${j.driver}" ไม่อยู่ในตาราง 1.3 ที่ผ่าน`);
    if (j.car !== "driver_only" && !plates.has(j.plate)) bad(`jobs.csv ${j.id}`, `ทะเบียน ${j.plate} ไม่อยู่ในตาราง 1.2 ที่ผ่าน`);
    if (!rules.find((r) => r.car_type === j.car && r.service_type === j.service)) bad(`jobs.csv ${j.id}`, `ยังไม่มีราคา ${j.car}/${j.service} ในระบบ — ตั้งใน /admin/prices ก่อน`);
  }

  if (problems.length) {
    console.log(`\n✗ พบปัญหา ${problems.length} รายการ — แก้ในชีตแล้ว export ใหม่:`);
    for (const p of problems) console.log(`  - ${p}`);
    process.exitCode = 1;
  } else if (!APPLY) {
    console.log("\n✓ ผ่านการตรวจ — รันอีกครั้งพร้อม --apply เพื่อเขียนข้อมูล");
  } else {
    await db.query("begin");
    // ข้อมูลย้อนหลังข้าม state machine/guard (งานจบไปแล้ว) → ปิด trigger ชั่วคราวใน transaction นี้ แล้วบันทึก audit สรุปเอง
    await db.query("set local session_replication_role = replica");
    const invites: string[][] = [["ชื่อ", "ลิงก์เชิญ (ใช้ครั้งเดียว 72 ชม.)"]];
    const driverId = new Map<string, string>();
    for (const d of D_OK) {
      const { rows } = await db.query(
        `insert into users (auth_user_id, role, display_name, full_name_enc) values (gen_random_uuid(), 'driver', $1, $2) returning id`,
        [d.name.split(/\s+/)[0], encryptField(d.name)]);
      await db.query(`insert into drivers (user_id) values ($1)`, [rows[0].id]);
      const token = randomBytes(24).toString("base64url");
      await db.query(`insert into driver_invites (user_id, token_hash, created_by, expires_at) values ($1, $2, $3, now() + interval '72 hours')`,
        [rows[0].id, createHash("sha256").update(token).digest("hex"), owner.id]);
      invites.push([d.name, driverInviteLink(process.env.APP_URL ?? "http://localhost:3000", token)]);
      driverId.set(d.name, rows[0].id);
    }
    const vehicleId = new Map<string, string>();
    for (const v of V_OK) {
      const { rows } = await db.query(
        `insert into vehicles (driver_id, car_type, plate, seats, luggage, registration_type, owner_name) values ($1,$2,$3,$4,$5,'',$6) returning id`,
        [driverId.get(vehicleDriver.get(v.no)!), v.car, v.plate, v.seats, v.luggage, v.owner || null]);
      vehicleId.set(v.plate, rows[0].id);
    }
    const { rows: pc } = await db.query(
      `insert into users (auth_user_id, role, status, display_name) values (gen_random_uuid(), 'customer', 'blocked', 'ลูกค้า Pilot (ประวัติ)')
       returning id`);
    const customer = pc[0].id;
    let imported = 0;
    for (const j of J_OK) {
      const dup = await db.query(`select 1 from quotes where breakdown->>'pilot_id' = $1`, [j.id]);
      if (dup.rows[0]) continue;
      const rule = rules.find((r) => r.car_type === j.car && r.service_type === j.service)!;
      const created = j.contacted ?? j.pickup;
      const { rows: n } = await db.query(`select next_number('Q') as n`);
      const { rows: qrow } = await db.query(
        `insert into quotes (number, customer_id, created_by, service_type, car_type, origin, destination, pickup_at, pax, luggage,
                             flight_no, no_flight, price_rule_id, breakdown, computed_satang, discount_satang, final_satang,
                             tax_category, status, expires_at, source_answer, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'accepted',$19,$20,$21) returning id`,
        [n[0].n, customer, owner.id, j.service, j.car, { name: j.origin }, j.destination ? { name: j.destination } : null, j.pickup,
         j.pax, j.luggage, j.flight || null, j.service === "airport_transfer" && !j.flight, rule.id, { source: "pilot", pilot_id: j.id, quoted_satang: j.quoted },
         j.final + j.discount, j.discount, j.final, rule.tax_category, j.pickup, j.src || null, created]);
      const { rows: b } = await db.query(
        `insert into bookings (quote_id, customer_id, service_type, car_type, status, driver_id, vehicle_id, pickup_at, est_end_at,
                               price_satang, deposit_satang, terms_version, terms_accepted_at, source_platform, customer_confirmed_at, created_at)
         values ($1,$2,$3,$4,'completed',$5,$6,$7,$7::timestamptz + interval '2 hours',$8,$9,'pilot',$10,$11,$7,$10) returning id`,
        [qrow[0].id, customer, j.service, j.car, driverId.get(j.driver), j.car === "driver_only" ? null : vehicleId.get(j.plate),
         j.pickup, j.final, j.deposit, created, platform(j.src)]);
      const bid = b[0].id;
      await db.query(`insert into payments (booking_id, kind, method, amount_satang, status, approved_by, raw, created_at)
                      values ($1, 'deposit', 'manual', $2, 'verified', $3, '{"source":"pilot"}', $4)`, [bid, j.deposit, owner.id, created]);
      if (j.final > j.deposit) {
        await db.query(`insert into payments (booking_id, kind, method, amount_satang, status, approved_by, raw, created_at)
                        values ($1, 'balance', 'manual', $2, 'verified', $3, '{"source":"pilot"}', $4)`, [bid, j.final - j.deposit, owner.id, j.pickup]);
      }
      if (j.reimburse > 0) {
        await db.query(`insert into payments (booking_id, kind, method, amount_satang, status, approved_by, raw, created_at)
                        values ($1, 'reimbursement', 'manual', $2, 'verified', $3, '{"source":"pilot"}', $4)`, [bid, j.reimburse, owner.id, j.pickup]);
      }
      if (j.driverPay !== null && j.paidAt) {
        // ยอดที่โอนจริงในชีต: gross = ราคา · ส่วนต่างที่เหลือถือเป็นค่าคอม (ไม่หัก ณ ที่จ่ายในช่วง pilot ❓ นักบัญชี)
        const commission = j.final + j.reimburse - j.driverPay;
        const { rows: p } = await db.query(
          `insert into payouts (driver_id, status, gross_satang, commission_satang, reimburse_satang, paid_at, proof_file_path, created_at)
           values ($1, 'paid', $2, $3, $4, $5, 'pilot-import', $5) returning id`,
          [driverId.get(j.driver), j.final, commission, j.reimburse, j.paidAt]);
        await db.query(`insert into payout_items (payout_id, booking_id) values ($1, $2)`, [p[0].id, bid]);
      }
      if (j.rating) await db.query(`insert into reviews (booking_id, rating, comment) values ($1, $2, $3)`, [bid, j.rating, j.issue || null]);
      imported++;
    }
    for (const a of A_OK) {
      // unique (date, platform, campaign_id) ไม่กันแถว campaign_id = null ซ้ำ → เช็กเอง
      await db.query(`insert into ad_spend (date, platform, campaign_id, amount_satang, entry)
                      select $1, $2, null, $3, 'pilot_import'
                      where not exists (select 1 from ad_spend where date = $1 and platform = $2 and campaign_id is null)`, [a.date, a.platform, a.amount]);
    }
    await db.query(`insert into audit_logs (actor_id, actor_role, action, entity, after, reason) values ($1, 'import', 'PILOT_IMPORT', 'pilot', $2, 'scripts/import-pilot.ts')`,
      [owner.id, { drivers: D_OK.length, vehicles: V_OK.length, jobs: imported, ad_weeks: A_OK.length }]);
    await db.query("commit");
    const out = join(dir, "pilot-invites.csv");
    writeFileSync(out, "﻿" + invites.map((r) => r.join(",")).join("\r\n") + "\r\n");
    console.log(`\n✓ นำเข้าแล้ว: คนขับ ${D_OK.length} · รถ ${V_OK.length} · งาน ${imported} · แอด ${A_OK.length} สัปดาห์`);
    console.log(`  ลิงก์เชิญคนขับ (ข้อมูลลับ ส่งทาง LINE ส่วนตัวแล้วลบไฟล์): ${out}`);
  }
} catch (e) {
  await db.query("rollback").catch(() => {});
  throw e;
} finally {
  await db.end();
}
