import { expect, test, type APIRequestContext } from "@playwright/test";
import { bookAndPay, closeDb, ctx, futurePickup, loginLine, paySlip, PLACES, q } from "./helpers";

// ลูกค้าจ่ายยอดคงเหลือครบ → คนขับที่รับงานได้ LINE ว่าไม่ต้องเก็บเงินหน้างาน
// ค่าเริ่มต้นประหยัดโควตา (settings.line_push.payments = false) → ไม่ส่ง · เปิดแล้ว → ส่ง
// ใช้ลูกค้าของตัวเอง ไม่แย่งโควตาขอราคา 10 ครั้ง/ชม. กับไฟล์อื่น
const setPayments = (on: boolean) =>
  q(`update settings set value = jsonb_set(value, '{payments}', $1::jsonb) where key = 'line_push'`, [JSON.stringify(on)]);

test.beforeAll(async () => {
  await q(`insert into users (auth_user_id, role, line_user_id, display_name)
           values (gen_random_uuid(), 'customer', 'Udev-customer-balance', 'ลูกค้าทดสอบยอดคงเหลือ')
           on conflict (line_user_id) do nothing`);
});
test.afterAll(async () => {
  await setPayments(false);
  await closeDb();
});

/** จอง → คนขับรับงาน → ลูกค้าจ่ายยอดคงเหลือ · คืน id ที่ใช้ตรวจ outbox */
async function bookAcceptAndPayBalance() {
  const customer = await ctx();
  await loginLine(customer, "Udev-customer-balance");
  const { bookingId } = await bookAndPay(customer, {
    service_type: "hourly_charter", car_type: "driver_only", origin: PLACES.siam,
    pickup_at: futurePickup(60 + Math.floor(Math.random() * 200)), // วันสุ่ม: รันซ้ำแล้วไม่ชนงานเดิมของคนขับ
    hours: 5, pax: 1, luggage: 0, child_seats: 0,
  });
  const [offer] = await q<{ id: string; line: string }>(
    `select o.id, u.line_user_id as line from job_offers o join users u on u.id = o.driver_id
      where o.booking_id = $1 and o.result = 'pending' order by u.line_user_id limit 1`, [bookingId]);
  expect(offer).toBeTruthy();
  const driver = await ctx();
  await loginLine(driver, offer.line);
  expect((await driver.post(`/api/offers/${offer.id}/accept`, { data: {} })).ok()).toBe(true);

  const bal = await customer.post(`/api/bookings/${bookingId}/balance`);
  expect(bal.status()).toBe(201);
  const pay = (await bal.json()) as { id: string; amount_satang: number };
  expect((await paySlip(customer, pay.id, pay.amount_satang)).status).toBe("verified");
  for (const c of [customer, driver] as APIRequestContext[]) await c.dispose();
  return { bookingId, paymentId: pay.id, driverLine: offer.line };
}

test("payment messages are not sent by default, to save LINE quota", async () => {
  await setPayments(false);
  const { bookingId, paymentId } = await bookAcceptAndPayBalance();
  expect(await q(`select 1 from outbox where dedupe_key = $1`, [`balance-paid-driver:${bookingId}`])).toHaveLength(0);
  expect(await q(`select 1 from outbox where dedupe_key = $1`, [`paid:${paymentId}`])).toHaveLength(0);
  // ข้อความที่ยังเปิดอยู่ (ยืนยันการจอง) ยังส่งตามปกติ
  expect(await q(`select 1 from outbox where dedupe_key = $1`, [`confirmed:${bookingId}`])).toHaveLength(1);
});

test("with payment messages switched on, the assigned driver is told the balance is paid", async () => {
  await setPayments(true);
  const { bookingId, paymentId, driverLine } = await bookAcceptAndPayBalance();
  const msgs = await q<{ to: string; text: string }>(
    `select payload->>'to' as to, payload->'messages'->0->>'text' as text from outbox where dedupe_key = $1`,
    [`balance-paid-driver:${bookingId}`]);
  expect(msgs).toHaveLength(1);
  expect(msgs[0].to).toBe(driverLine);
  expect(msgs[0].text).toContain("ลูกค้าชำระยอดครบแล้ว");
  expect(await q(`select 1 from outbox where dedupe_key = $1`, [`paid:${paymentId}`])).toHaveLength(1);
});
