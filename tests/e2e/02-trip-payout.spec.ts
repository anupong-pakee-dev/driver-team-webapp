import { expect, test } from "@playwright/test";
import { bookAndPay, bookingStatus, closeDb, ctx, loginLine, loginStaff, pendingOffer, PNG, q, soonPickup } from "./helpers";

// §15 (2) dispatch → รับงาน → check-in → จบงาน → payout
// (6) ขอเบอร์ลูกค้านอกช่วงเวลา → 403
test.afterAll(closeDb);

test("dispatch, trip day, completion and payout", async () => {
  const customer = await ctx();
  const driver = await ctx();
  const other = await ctx();
  const owner = await ctx();
  await loginLine(customer, "Udev-customer-1");
  const driverId = await loginLine(driver, "Udemo-chai");   // รถตู้ VIP คันเดียวในข้อมูลสาธิต
  await loginLine(other, "Udemo-boon");
  await loginStaff(owner, "owner@example.test");

  // ไกลกว่า 2 ชม. → ยังขอเบอร์ไม่ได้
  const { bookingId } = await bookAndPay(customer, {
    service_type: "point_to_point", car_type: "van_vip", origin_place_id: "stub:siam", destination_place_id: "stub:huahin",
    pickup_at: soonPickup(170), pax: 4, luggage: 3, child_seats: 0,
  });
  const offer = await pendingOffer(bookingId);
  expect(offer.driver_id).toBe(driverId);

  expect((await other.post(`/api/offers/${offer.id}/accept`, { data: {} })).status()).toBe(404);
  expect((await driver.post(`/api/offers/${offer.id}/accept`, { data: {} })).ok()).toBe(true);
  expect(await bookingStatus(bookingId)).toBe("assigned");

  const early = await driver.get(`/api/bookings/${bookingId}/contact`);
  expect(early.status()).toBe(403);
  expect((await other.get(`/api/bookings/${bookingId}/contact`)).status()).toBe(403);

  const step = (to: string, lat: number, lng: number, photo = false) =>
    driver.post(`/api/bookings/${bookingId}/status`, {
      multipart: { to, lat: String(lat), lng: String(lng), accuracy_m: "10",
        ...(photo ? { photo: { name: "p.png", mimeType: "image/png", buffer: PNG } } : {}) },
    });
  expect((await step("arrive", 13.7462, 100.5347)).status()).toBe(409);       // ข้ามขั้นไม่ได้
  expect((await step("depart", 13.74, 100.53)).ok()).toBe(true);

  // เลื่อนเวลารับเข้าในช่วงเปิดเบอร์
  await q(`update bookings set pickup_at = now() + interval '30 minutes', est_end_at = now() + interval '4 hours' where id = $1`, [bookingId]);
  const contact = await driver.get(`/api/bookings/${bookingId}/contact`);
  expect(contact.ok()).toBe(true);
  expect((await contact.json()).phone).toBe("+66811111111");

  expect((await step("arrive", 13.7462, 100.5347)).ok()).toBe(true);
  expect((await step("pickup", 13.7462, 100.5347)).status()).toBe(400);         // ไม่มีรูป
  expect((await step("pickup", 13.7462, 100.5347, true)).ok()).toBe(true);
  const drop = await (await step("dropoff", 12.5684, 99.9577, true)).json();
  expect(drop.status).toBe("dropped_off");

  expect((await customer.post(`/api/bookings/${bookingId}/complete`, { data: { rating: 5 } })).ok()).toBe(true);
  expect(await bookingStatus(bookingId)).toBe("completed");

  expect((await owner.post("/api/admin/payouts/build")).ok()).toBe(true);
  const [item] = await q<{ payout_id: string; gross: string; net: string }>(
    `select payout_id, gross_satang as gross, gross_satang - commission_satang - withholding_satang + reimburse_satang as net
       from payout_items where booking_id = $1`, [bookingId]);
  expect(Number(item.gross)).toBeGreaterThan(0);
  const paid = await owner.post(`/api/admin/payouts/${item.payout_id}/paid`, {
    multipart: { file: { name: "proof.png", mimeType: "image/png", buffer: PNG } },
  });
  expect(paid.ok()).toBe(true);
  const [p] = await q<{ status: string }>(`select status from payouts where id = $1`, [item.payout_id]);
  expect(p.status).toBe("paid");
  const reveals = await q(`select 1 from contact_reveals where booking_id = $1`, [bookingId]);
  expect(reveals.length).toBe(1);
  for (const c of [customer, driver, other, owner]) await c.dispose();
});
