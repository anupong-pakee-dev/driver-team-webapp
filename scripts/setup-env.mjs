// สร้าง .env.local สำหรับ local จาก .env.example + ค่า Supabase local + secrets สุ่ม (ไม่เขียนทับไฟล์เดิม)
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (existsSync(".env.local")) {
  console.log(".env.local already exists — not overwriting");
  process.exit(0);
}

const status = JSON.parse(execSync("npx supabase status -o json", { encoding: "utf8" }));
const rand = (n) => randomBytes(n).toString("base64");
const values = {
  DATABASE_URL: status.DB_URL,
  NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
  SESSION_SECRET: rand(48),
  FIELD_ENCRYPTION_KEY: rand(32),
  PHONE_HASH_KEY: rand(32),
  CRON_SECRET: randomBytes(24).toString("hex"),
  DEV_SEED_PASSWORD: `dev-${randomBytes(9).toString("base64url")}`,
};

const out = readFileSync(".env.example", "utf8")
  .split("\n")
  .map((line) => {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    return m && values[m[1]] !== undefined ? `${m[1]}=${values[m[1]]}` : line;
  })
  .join("\n");
writeFileSync(".env.local", out);
console.log("wrote .env.local");
