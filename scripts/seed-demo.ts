// ข้อมูลสาธิตสำหรับ local เท่านั้น: คนขับ 3 คน + รถ 3 คันที่ "รับงานได้" เพื่อทดลองแคตตาล็อก/ใบเสนอราคา
// ⚠️ ตั้ง allowed_registrations / license_coverage / bg_check_valid_years เป็นค่าสาธิต — ไม่ใช่คำตอบ ขบ./ทนาย
// รัน: npm run seed:demo (หลัง seed:dev)
import pg from "pg";
import { encryptField, normalizeThaiPhone, phoneHash } from "../src/lib/crypto.ts";

if (process.env.NODE_ENV === "production") throw new Error("seed-demo must not run in production");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
await db.query("begin");
await db.query(`select set_config('app.actor_role', 'seed', true), set_config('app.reason', 'seed-demo (DEMO ONLY)', true)`);

const NOTE = "DEMO — ไม่ใช่คำตอบ ขบ.";
for (const svc of ["airport_transfer", "point_to_point", "hourly_charter", "daily_charter"]) {
  await db.query(
    `insert into allowed_registrations (service_type, registration_type, note, confirmed_by_dlt_at)
     values ($1, 'ry10', $2, current_date) on conflict do nothing`, [svc, NOTE]);
}
for (const car of ["sedan", "suv", "van", "van_vip", "mpv_premium"]) {
  await db.query(`insert into license_coverage values ('car_public', $1) on conflict do nothing`, [car]);
}
await db.query(`update settings set value = value || '{"bg_check_valid_years":1}' where key = 'compliance'`);

const year = (n: number) => `current_date + ${n * 365}`;
const demo = [
  { line: "Udemo-anan", nick: "พี่อนันต์ (demo)", phone: "0861111111", car: "sedan", plate: "DEMO-1", seats: 3, luggage: 2 },
  { line: "Udemo-boon", nick: "พี่บุญ (demo)", phone: "0862222222", car: "suv", plate: "DEMO-2", seats: 6, luggage: 4 },
  { line: "Udemo-chai", nick: "พี่ชาย (demo)", phone: "0863333333", car: "van_vip", plate: "DEMO-3", seats: 10, luggage: 8 },
];
for (const d of demo) {
  const e164 = normalizeThaiPhone(d.phone)!;
  const { rows } = await db.query(
    `insert into users (auth_user_id, role, line_user_id, display_name, full_name_enc, phone_enc, phone_hash)
     values (gen_random_uuid(), 'driver', $1, $2, $3, $4, $5)
     on conflict (line_user_id) do update set display_name = excluded.display_name returning id`,
    [d.line, d.nick, encryptField(d.nick), encryptField(e164), phoneHash(e164)],
  );
  const uid = rows[0].id;
  await db.query(
    `insert into drivers (user_id, public_license_class, public_license_expiry, background_check_at, background_check_passed,
                          bank_account_enc, bank_account_last4)
     values ($1, 'car_public', ${year(3)}, current_date - 30, true, $2, '0000')
     on conflict (user_id) do nothing`,
    [uid, encryptField("0000000000")],
  );
  for (const kind of ["driver_contract", "privacy"]) {
    await db.query(`insert into consents (user_id, kind, version, granted, channel) values ($1, $2, 'draft-2026-10', true, 'seed')`, [uid, kind]);
  }
  for (const t of ["id_card", "public_license", "selfie_with_id", "bank_book"]) {
    await db.query(`insert into documents (owner_type, owner_id, doc_type, file_path, status) values ('driver', $1, $2, 'demo/placeholder', 'approved')`, [uid, t]);
  }
  const { rows: v } = await db.query(
    `insert into vehicles (driver_id, car_type, plate, seats, luggage, registration_type, owner_name,
                           compulsory_insurance_expiry, voluntary_insurer, voluntary_policy_no, voluntary_insurance_usage,
                           voluntary_insurance_expiry, insurance_claim_phone, passenger_insurance_sum_satang,
                           passenger_insurance_expiry, tax_expiry, inspection_due)
     values ($1, $2, $3, $4, $5, 'ry10', $6, ${year(1)}, 'DEMO', 'DEMO', 'commercial_hire', ${year(1)}, '1557', 20000000,
             ${year(1)}, ${year(1)}, ${year(1)})
     on conflict (plate) do update set driver_id = excluded.driver_id returning id`,
    [uid, d.car, d.plate, d.seats, d.luggage, d.nick],
  );
  for (const t of ["registration_book", "compulsory_ins", "voluntary_ins", "passenger_ins", "tax_receipt", "inspection", "vehicle_photo"]) {
    await db.query(`insert into documents (owner_type, owner_id, doc_type, file_path, status) values ('vehicle', $1, $2, 'demo/placeholder', 'approved')`, [v[0].id, t]);
  }
  await db.query(`select refresh_kyc('driver', $1), refresh_kyc('vehicle', $2)`, [uid, v[0].id]);
}
await db.query("commit");
const { rows } = await db.query(`select service_type, car_type from catalog_available(current_date) order by 1, 2`);
await db.end();
console.log("demo ready — available:", rows.map((r) => `${r.service_type}/${r.car_type}`).join(", "));
