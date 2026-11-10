import { defineConfig, devices } from "@playwright/test";

// §15 E2E: ต้องมี Supabase local + `npm run seed:dev && npm run seed:demo`
// local ใช้ Microsoft Edge ที่ติดตั้งอยู่แล้ว (ไม่ต้องดาวน์โหลดเบราว์เซอร์) · CI ใช้ chromium ของ Playwright
const ci = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  workers: 1, // ใช้ฐานข้อมูลและคนขับสาธิตชุดเดียวกัน
  retries: ci ? 1 : 0,
  reporter: ci ? "github" : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    locale: "th-TH", // ฝั่งลูกค้าเลือกภาษาจาก Accept-Language — เทสต์เดิมเขียนด้วยข้อความไทย (06-i18n ทดสอบภาษาอื่น)
    trace: "retain-on-failure",
  },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"], ...(ci ? {} : { channel: "msedge" }) } }],
  webServer: {
    command: "npm run dev", // dev login ใช้ได้เฉพาะ NODE_ENV ≠ production จึงรันกับ next start ไม่ได้
    url: "http://localhost:3000/api/health",
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
