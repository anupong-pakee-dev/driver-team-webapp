import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { request as pwRequest, expect, type APIRequestContext } from "@playwright/test";
import pg from "pg";

// ตัวช่วย E2E: บัญชีทดสอบจาก seed:dev / seed:demo · สลิปจำลอง DEVSLIP (ใช้ได้เฉพาะ non-production)

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI ตั้ง env เอง */
}

export const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const PNG = readFileSync("tests/e2e/fixtures/pixel.png");

let client: pg.Client | null = null;
export async function q<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  if (!client) {
    client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();
  }
  return (await client.query(sql, params)).rows as T[];
}
export async function closeDb() {
  await client?.end();
  client = null;
}

export async function ctx(): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { origin: BASE } });
}

export async function loginLine(c: APIRequestContext, lineUserId: string) {
  const [u] = await q<{ id: string }>(`select id from users where line_user_id = $1`, [lineUserId]);
  expect(u, `seed user ${lineUserId}`).toBeTruthy();
  expect((await c.post("/api/auth/dev", { data: { user_id: u.id } })).ok()).toBe(true);
  return u.id;
}

export async function loginStaff(c: APIRequestContext, email: "owner@example.test" | "sales@example.test") {
  const res = await c.post("/api/auth/admin", { data: { email, password: process.env.DEV_SEED_PASSWORD } });
  expect(res.ok(), await res.text()).toBe(true);
}

/** เวลารับที่ไม่ชนกับรอบอื่น: วันในอนาคต + นาทีสุ่ม */
export function futurePickup(daysAhead: number) {
  const d = new Date(Date.now() + daysAhead * 86_400_000);
  d.setUTCHours(2 + Math.floor(Math.random() * 8), Math.floor(Math.random() * 4) * 15, 0, 0);
  return d.toISOString();
}

export function soonPickup(minutes = 150) {
  const d = new Date(Date.now() + minutes * 60_000);
  d.setUTCSeconds(0, 0);
  return d.toISOString();
}

export async function createQuote(c: APIRequestContext, body: Record<string, unknown>) {
  const res = await c.post("/api/quotes", { data: body, headers: { "idempotency-key": randomUUID() } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { id: string; final_satang: number; deposit_satang: number };
}

export const ACCEPT = {
  terms_version: "draft-2026-10", privacy_version: "draft-2026-10", marketing_tracking: false,
  full_name: "ลูกค้า ทดสอบ E2E", phone: "0811111111",
};

export async function acceptQuote(c: APIRequestContext, quoteId: string, extra: Record<string, unknown> = {}) {
  const res = await c.post(`/api/quotes/${quoteId}/accept`, { data: { ...ACCEPT, ...extra }, headers: { "idempotency-key": randomUUID() } });
  expect(res.status(), await res.text()).toBe(201);
  return (await res.json()) as { booking_id: string; payment: { id: string; amount_satang: number } };
}

export async function paySlip(c: APIRequestContext, paymentId: string, amount: number) {
  const payload = `DEVSLIP|E2E${randomUUID().slice(0, 8)}|${amount}|0812345678|${new Date().toISOString()}`;
  const res = await c.post(`/api/payments/${paymentId}/slip`, { data: { qr_payload: payload } });
  expect(res.ok()).toBe(true);
  return (await res.json()) as { status: string };
}

/** จองจนมัดจำยืนยัน → คืน booking id */
export async function bookAndPay(c: APIRequestContext, body: Record<string, unknown>) {
  const qt = await createQuote(c, body);
  // บริการ "คนขับอย่างเดียว" ใช้รถลูกค้า → ต้องยอมรับข้อตกลงความรับผิดเกี่ยวกับรถ
  const a = await acceptQuote(c, qt.id, body.car_type === "driver_only" ? { vehicle_liability: true } : {});
  expect((await paySlip(c, a.payment.id, a.payment.amount_satang)).status).toBe("verified");
  return { bookingId: a.booking_id, quote: qt };
}

// ตำแหน่งที่ลูกค้าส่งมา (GPS / ปักหมุด / ลิงก์) — พิกัดจริงโดยประมาณ
export const PLACES = {
  asok: { lat: 13.737, lng: 100.5603, name: "สุขุมวิท อโศก", source: "pin" },
  siam: { lat: 13.7462, lng: 100.5347, name: "สยามพารากอน", source: "link" },
  silom: { lat: 13.729, lng: 100.534, name: "สีลม", source: "gps" },
  huahin: { lat: 12.5684, lng: 99.9577, name: "หัวหิน", source: "pin" },
} as const;

export const airport = (car: string, pickup_at: string) => ({
  service_type: "airport_transfer", car_type: car, destination: PLACES.asok, pickup_at,
  pax: 2, luggage: 2, child_seats: 0, flight: { no: "TG123", airport: "BKK", direction: "arrival" },
});

export async function bookingStatus(id: string) {
  return (await q<{ status: string }>(`select status from bookings where id = $1`, [id]))[0]?.status;
}

export async function pendingOffer(bookingId: string) {
  return (await q<{ id: string; driver_id: string }>(`select id, driver_id from job_offers where booking_id = $1 and result = 'pending'`, [bookingId]))[0];
}
