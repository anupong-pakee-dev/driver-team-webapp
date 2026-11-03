// ผู้ใช้ทดสอบสำหรับ local: เจ้าของ + แอดมินขาย (Supabase Auth) · ลูกค้า 2 · คนขับ 2
// รัน: npm run seed:dev  (หลัง supabase db reset) · รหัสผ่านแอดมินอยู่ใน DEV_SEED_PASSWORD ของ .env.local
import pg from "pg";
import { createClient } from "@supabase/supabase-js";
import { encryptField, normalizeThaiPhone, phoneHash } from "../src/lib/crypto.ts";

const env = process.env;
if (env.NODE_ENV === "production") throw new Error("seed-dev must not run in production");
for (const k of ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "DEV_SEED_PASSWORD"]) {
  if (!env[k]) throw new Error(`${k} missing — run npm run setup:env`);
}

const db = new pg.Client({ connectionString: env.DATABASE_URL });
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function staff(email: string, role: "owner" | "sales_admin", name: string) {
  const { data: list } = await sb.auth.admin.listUsers();
  let authId = list?.users.find((u) => u.email === email)?.id;
  if (!authId) {
    const { data, error } = await sb.auth.admin.createUser({ email, password: env.DEV_SEED_PASSWORD!, email_confirm: true });
    if (error) throw error;
    authId = data.user.id;
  }
  await db.query(
    `insert into users (auth_user_id, role, display_name) values ($1, $2, $3)
     on conflict (auth_user_id) do update set role = excluded.role, display_name = excluded.display_name`,
    [authId, role, name],
  );
}

async function lineUser(lineId: string, role: "customer" | "driver", nick: string, fullName: string, phone: string) {
  const e164 = normalizeThaiPhone(phone)!;
  const { rows } = await db.query(
    `insert into users (auth_user_id, role, line_user_id, display_name, full_name_enc, phone_enc, phone_hash)
     values (gen_random_uuid(), $1, $2, $3, $4, $5, $6)
     on conflict (line_user_id) do update set display_name = excluded.display_name
     returning id`,
    [role, lineId, nick, encryptField(fullName), encryptField(e164), phoneHash(e164)],
  );
  if (role === "driver") {
    await db.query(`insert into drivers (user_id, public_license_class) values ($1, null) on conflict do nothing`, [rows[0].id]);
  }
}

await db.connect();
await db.query(`select set_config('app.actor_role', 'seed', false), set_config('app.reason', 'seed-dev', false)`);
await staff("owner@example.test", "owner", "เจ้าของ (ทดสอบ)");
await staff("sales@example.test", "sales_admin", "แอดมินขาย (ทดสอบ)");
await lineUser("Udev-customer-1", "customer", "ลูกค้า ก", "ลูกค้า ทดสอบหนึ่ง", "0810000001");
await lineUser("Udev-customer-2", "customer", "ลูกค้า ข", "ลูกค้า ทดสอบสอง", "0810000002");
await lineUser("Udev-driver-1", "driver", "พี่ชัย", "ชัย ทดสอบ", "0820000001");
await lineUser("Udev-driver-2", "driver", "พี่นก", "นก ทดสอบ", "0820000002");
await db.end();
console.log("seeded: owner@example.test, sales@example.test (password = DEV_SEED_PASSWORD), 2 customers, 2 drivers");
