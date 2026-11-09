import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { airport, bookAndPay, closeDb, createQuote, ctx, futurePickup, loginLine, loginStaff, pendingOffer, q } from "./helpers";

// §15 (3) ยกเลิก · (4) เอกสารหมดอายุ → ไม่ได้ข้อเสนอ · (5) ส่วนลด > 10% ต้องอนุมัติ
test.afterAll(closeDb);

test("cancellation shows and applies the refund policy", async () => {
  const customer = await ctx();
  await loginLine(customer, "Udev-customer-1");
  const { bookingId } = await bookAndPay(customer, airport("sedan", futurePickup(25)));
  const preview = await (await customer.get(`/api/bookings/${bookingId}/cancellation-preview`)).json();
  expect(preview.rule).toBe(">48h");
  expect(preview.refund_satang).toBe(preview.paid_satang);
  const res = await customer.post(`/api/bookings/${bookingId}/cancel`, {
    data: { reason: "change of plan" }, headers: { "idempotency-key": randomUUID() } });
  expect(res.ok()).toBe(true);
  const [r] = await q<{ amount_satang: string; status: string }>(
    `select amount_satang, status from payments where booking_id = $1 and kind = 'refund'`, [bookingId]);
  expect(Number(r.amount_satang)).toBe(preview.refund_satang);
  expect(r.status).toBe("pending");
  await customer.dispose();
});

test("a driver whose insurance expires before the job date gets no offer", async () => {
  const customer = await ctx();
  await loginLine(customer, "Udev-customer-1");
  const [v] = await q<{ id: string; exp: string }>(
    `select id, voluntary_insurance_expiry::text as exp from vehicles where plate = 'DEMO-2'`);
  try {
    await q(`update vehicles set voluntary_insurance_expiry = current_date + 5 where id = $1`, [v.id]);
    const { bookingId } = await bookAndPay(customer, airport("suv", futurePickup(15)));
    expect(await pendingOffer(bookingId)).toBeUndefined();
    const [b] = await q<{ status: string }>(`select status from bookings where id = $1`, [bookingId]);
    expect(b.status).toBe("confirmed"); // รอ owner เลือกเอง — ไม่มีคนผ่านเกณฑ์
  } finally {
    await q(`update vehicles set voluntary_insurance_expiry = $2::date where id = $1`, [v.id, v.exp]);
  }
  await customer.dispose();
});

test("sales discount above 10% waits for owner approval; below floor is refused", async () => {
  const customer = await ctx();
  const sales = await ctx();
  const owner = await ctx();
  await loginLine(customer, "Udev-customer-1");
  await loginStaff(sales, "sales@example.test");
  await loginStaff(owner, "owner@example.test");
  const qt = await createQuote(customer, airport("sedan", futurePickup(30)));

  const disc = (c: typeof sales, id: string, satang: number) =>
    c.post(`/api/quotes/${id}/discount`, { data: { discount_satang: satang, reason: "regular" }, headers: { "idempotency-key": randomUUID() } });

  const tooMuch = await disc(sales, qt.id, qt.final_satang - 1);
  expect(tooMuch.status()).toBe(422);
  expect((await tooMuch.json()).error.code).toBe("BELOW_FLOOR");

  const over = await (await disc(sales, qt.id, Math.floor(qt.final_satang * 0.11))).json();
  expect(over.status).toBe("pending_approval");
  expect((await sales.post(`/api/quotes/${over.id}/discount/approve`, { data: { approve: true } })).status()).toBe(403);
  expect((await (await owner.post(`/api/quotes/${over.id}/discount/approve`, { data: { approve: true } })).json()).status).toBe("sent");
  const revs = await q<{ status: string }>(`select status from quotes where number = (select number from quotes where id = $1) order by revision`, [qt.id]);
  expect(revs.map((r) => r.status)).toEqual(["superseded", "sent"]);
  for (const c of [customer, sales, owner]) await c.dispose();
});
