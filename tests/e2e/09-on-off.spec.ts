import { expect, test } from "@playwright/test";
import { BASE, bookAndPay, closeDb, ctx, futurePickup, loginLine, PLACES, q } from "./helpers";

// คนขับเปิด/ปิดรับงาน (แทนปฏิทิน): off → ไม่ได้ข้อเสนอ + ข้อเสนอค้างถูกถอน · on → ได้ข้อเสนองานที่ยังเปิดอยู่ทันที
// ใช้ลูกค้าของตัวเอง ไม่แย่งโควตาขอราคา 10 ครั้ง/ชม. กับไฟล์อื่น
test.beforeAll(async () => {
  await q(`insert into users (auth_user_id, role, line_user_id, display_name)
           values (gen_random_uuid(), 'customer', 'Udev-customer-onoff', 'ลูกค้าทดสอบ on/off')
           on conflict (line_user_id) do nothing`);
});
test.afterAll(async () => {
  await q(`update drivers set accepting_jobs = true where user_id in (select id from users where line_user_id like 'Udemo-%')`);
  await closeDb();
});

const job = (days: number) => ({
  service_type: "hourly_charter", car_type: "driver_only", origin: PLACES.siam, pickup_at: futurePickup(days),
  hours: 5, pax: 1, luggage: 0, child_seats: 0,
});
const pendingFor = (bookingId: string, line: string) =>
  q<{ id: string }>(`select o.id from job_offers o join users u on u.id = o.driver_id
                      where o.booking_id = $1 and u.line_user_id = $2 and o.result = 'pending'`, [bookingId, line]);

test("a driver switched off gets no offers, and switching on picks up open jobs", async ({ page, context }) => {
  const chai = await ctx();
  await loginLine(chai, "Udemo-chai");

  // off → งานใหม่ไม่ถูกเสนอให้
  expect((await chai.post("/api/me/accepting", { data: { on: false } })).ok()).toBe(true);
  const customer = await ctx();
  await loginLine(customer, "Udev-customer-onoff");
  const { bookingId } = await bookAndPay(customer, job(53));
  expect(await pendingFor(bookingId, "Udemo-chai")).toHaveLength(0);
  expect((await pendingFor(bookingId, "Udemo-anan")).length).toBe(1);

  // on → ได้ข้อเสนองานที่ยังไม่มีคนรับทันที + การ์ด LINE
  const on = await chai.post("/api/me/accepting", { data: { on: true } });
  expect(on.ok()).toBe(true);
  expect((await on.json()).offered).toBeGreaterThanOrEqual(1);
  const [offer] = await pendingFor(bookingId, "Udemo-chai");
  expect(offer).toBeTruthy();
  expect(await q(`select 1 from outbox where dedupe_key = $1`, [`offer:${offer.id}`])).toHaveLength(1);

  // off อีกครั้ง → ข้อเสนอที่ค้างถูกถอน
  const off = await chai.post("/api/me/accepting", { data: { on: false } });
  expect((await off.json()).withdrawn).toBeGreaterThanOrEqual(1);
  const [after] = await q<{ result: string }>(`select result from job_offers where id = $1`, [offer.id]);
  expect(after.result).toBe("withdrawn");

  // หน้าแอป: สวิตช์แสดง OFF · ไม่มีแท็บปฏิทินแล้ว
  const [me] = await q<{ id: string }>(`select id from users where line_user_id = 'Udemo-chai'`);
  expect((await context.request.post(`${BASE}/api/auth/dev`, { headers: { origin: BASE }, data: { user_id: me.id } })).ok()).toBe(true);
  await page.goto(`${BASE}/liff/driver`);
  const sw = page.getByRole("switch", { name: "รับงาน" });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByRole("link", { name: "ปฏิทิน" })).toHaveCount(0);
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");

  for (const c of [chai, customer]) await c.dispose();
});
