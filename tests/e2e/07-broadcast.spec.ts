import { expect, test } from "@playwright/test";
import { BASE, bookAndPay, closeDb, ctx, futurePickup, loginLine, PLACES, q } from "./helpers";

// ประกาศงานถึงคนขับทุกคนที่ผ่านเกณฑ์พร้อมกัน → คนแรกที่กดรับได้งาน → คนอื่น "มีคนรับแล้ว" → งานจบ "ปิดงานแล้ว"
// เหมารายชั่วโมงแบบ "คนขับอย่างเดียว" ไม่ผูกกับรถ → คนขับสาธิตทั้ง 3 คนผ่านเกณฑ์งานเดียวกัน
test.afterAll(closeDb);

const DRIVERS = ["Udemo-anan", "Udemo-boon", "Udemo-chai"];
const job = (days: number) => ({
  service_type: "hourly_charter", car_type: "driver_only", origin: PLACES.siam, pickup_at: futurePickup(days),
  hours: 5, pax: 1, luggage: 0, child_seats: 0,
});

async function openOffers(bookingId: string) {
  return q<{ id: string; driver_id: string; line: string }>(
    `select o.id, o.driver_id, u.line_user_id as line from job_offers o join users u on u.id = o.driver_id
      where o.booking_id = $1 and o.result = 'pending'`, [bookingId]);
}

test("every eligible driver gets the job; the first to accept wins and the rest are told it's taken", async ({ page, context }) => {
  const customer = await ctx();
  await loginLine(customer, "Udev-customer-2");
  const { bookingId } = await bookAndPay(customer, job(50));

  const offers = await openOffers(bookingId);
  expect(offers.map((o) => o.line).sort()).toEqual(expect.arrayContaining(DRIVERS));
  // ทุกคนได้การ์ดเสนองานใน LINE
  const cards = await q<{ to: string }>(`select payload->>'to' as to from outbox where dedupe_key = any($1)`, [offers.map((o) => `offer:${o.id}`)]);
  expect(cards.length).toBe(offers.length);
  // แต่ละข้อเสนอมีหมุดจุดรับ (LINE location) + ปุ่มดูระยะทางไปจุดรับ
  const msgs = await q<{ kinds: string[]; uris: string[] }>(
    `select array(select m->>'type' from jsonb_array_elements(payload->'messages') m) as kinds,
            array(select b->'action'->>'uri' from jsonb_array_elements(payload->'messages'->0->'contents'->'footer'->'contents') b
                   where b->'action'->>'type' = 'uri') as uris
       from outbox where dedupe_key = any($1)`, [offers.map((o) => `offer:${o.id}`)]);
  for (const m of msgs) {
    expect(m.kinds).toEqual(["flex", "location"]);
    expect(m.uris.some((u) => u.startsWith("https://www.google.com/maps/dir/"))).toBe(true);
  }

  const [winner, loser] = [offers.find((o) => o.line === "Udemo-anan")!, offers.find((o) => o.line === "Udemo-boon")!];
  const a = await ctx();
  const b = await ctx();
  await loginLine(a, winner.line);
  await loginLine(b, loser.line);
  expect((await a.post(`/api/offers/${winner.id}/accept`, { data: {} })).ok()).toBe(true);

  const late = await b.post(`/api/offers/${loser.id}/accept`, { data: {} });
  expect(late.status()).toBe(409);
  expect((await late.json()).error.details.reason).toBe("OFFER_TAKEN");

  const after = await q<{ driver_id: string; result: string }>(`select driver_id, result from job_offers where booking_id = $1`, [bookingId]);
  expect(after.filter((o) => o.result === "accepted").map((o) => o.driver_id)).toEqual([winner.driver_id]);
  expect(after.filter((o) => o.result === "taken").length).toBe(offers.length - 1);
  const [bk] = await q<{ status: string; driver_id: string }>(`select status, driver_id from bookings where id = $1`, [bookingId]);
  expect(bk).toEqual({ status: "assigned", driver_id: winner.driver_id });
  // คนที่ไม่ได้งานได้ LINE ว่ามีคนรับแล้ว
  const taken = await q<{ text: string }>(`select payload->'messages'->0->>'text' as text from outbox where dedupe_key = any($1)`,
    [offers.filter((o) => o.id !== winner.id).map((o) => `taken:${o.id}`)]);
  expect(taken.length).toBe(offers.length - 1);
  expect(taken[0].text).toContain("ปิดงานนี้แล้ว");
  // คนที่ได้งาน (กดรับในแอป) ได้ LINE ยืนยันว่าได้งานและปิดรับแล้ว
  const won = await q<{ to: string; text: string }>(
    `select payload->>'to' as to, payload->'messages'->0->>'text' as text from outbox where dedupe_key = $1`, [`won:${winner.id}`]);
  expect(won).toHaveLength(1);
  expect(won[0].to).toBe(winner.line);
  expect(won[0].text).toContain("คุณได้งานนี้แล้ว");

  // หน้าแอปของคนที่ไม่ได้งาน: มีคนรับแล้ว → งานจบ → ปิดงานแล้ว
  expect((await context.request.post(`${BASE}/api/auth/dev`, { headers: { origin: BASE }, data: { user_id: loser.driver_id } })).ok()).toBe(true);
  await page.goto(`${BASE}/liff/driver`);
  await expect(page.getByText("มีคนรับแล้ว").first()).toBeVisible();
  await q(`begin; set local session_replication_role = replica; update bookings set status = 'completed' where id = '${bookingId}'; commit;`);
  await page.reload();
  await expect(page.getByText("ปิดงานแล้ว").first()).toBeVisible();

  for (const c of [customer, a, b]) await c.dispose();
});

test("two drivers accepting at the same instant: exactly one gets the job", async () => {
  const customer = await ctx();
  await loginLine(customer, "Udev-customer-2");
  const { bookingId } = await bookAndPay(customer, job(55));
  const offers = (await openOffers(bookingId)).filter((o) => o.line === "Udemo-boon" || o.line === "Udemo-chai");
  expect(offers.length).toBe(2);

  const drivers = await Promise.all(offers.map(async (o) => { const c = await ctx(); await loginLine(c, o.line); return c; }));
  const results = await Promise.all(offers.map((o, i) => drivers[i].post(`/api/offers/${o.id}/accept`, { data: {} })));
  const statuses = results.map((r) => r.status()).sort();
  expect(statuses).toEqual([200, 409]);

  const accepted = await q(`select 1 from job_offers where booking_id = $1 and result = 'accepted'`, [bookingId]);
  expect(accepted.length).toBe(1);
  for (const c of [customer, ...drivers]) await c.dispose();
});
