import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PLACES, acceptQuote, BASE, closeDb, createQuote, ctx, futurePickup, loginLine, loginStaff, q } from "./helpers";

// §15 (7) ลิงก์แคมเปญ → booking มี source · FR-ADS-10 ไม่ยินยอม = ไม่มีคำขอไปแพลตฟอร์มโฆษณา
test.afterAll(closeDb);

test("campaign link carries attribution into the booking", async ({ page, context }) => {
  const owner = await ctx();
  await loginStaff(owner, "owner@example.test");
  const slug = `e2e-${randomUUID().slice(0, 8)}`;
  expect((await owner.post("/api/admin/campaigns", { data: {
    slug, name: `E2E ${slug}`, platform: "google", target: "landing", service_type: "daily_charter",
    utm_source: "google", utm_medium: "cpc", utm_campaign: slug, start_at: null, end_at: null, status: "active",
  } })).ok()).toBe(true);
  expect((await owner.post("/api/admin/landing/daily_charter", { data: { publish: true, checks:
    ["insurance_true", "background_true", "price_true", "not_tour", "media_consent", "company_channels"] } })).ok()).toBe(true);

  const adRequests: string[] = [];
  page.on("request", (r) => { if (/facebook|google-analytics|googletagmanager|tiktok/.test(r.url())) adRequests.push(r.url()); });

  await page.goto(`${BASE}/go/${slug}?gclid=Cj0KCQ-E2E-AbC`);
  await expect(page).toHaveURL(/\/l\/daily_charter/);
  await expect(page.getByRole("dialog", { name: "ความยินยอมคุกกี้" })).toBeVisible();
  expect(adRequests).toEqual([]);
  await page.getByRole("button", { name: "ยอมรับทั้งหมด" }).click();
  const cta = page.getByRole("link", { name: "ขอใบเสนอราคา" });
  await expect(cta).toHaveAttribute("href", /[?&]t=[0-9a-f-]{36}/);
  const tp = new URL(await cta.getAttribute("href") ?? "", BASE).searchParams.get("t")!;

  // login ลูกค้าในเบราว์เซอร์เดียวกัน แล้วเปิดลิงก์ ?t= → ผูก touchpoint
  const [c] = await q<{ id: string }>(`select id from users where line_user_id = 'Udev-customer-2'`);
  await q(`update users set status = 'active' where id = $1`, [c.id]);
  expect((await context.request.post(`${BASE}/api/auth/dev`, { headers: { origin: BASE }, data: { user_id: c.id } })).ok()).toBe(true);
  await page.goto(`${BASE}/liff/customer/quote?service=daily_charter&t=${tp}`);
  await expect.poll(async () => (await q(`select 1 from touchpoints where id = $1 and user_id = $2`, [tp, c.id])).length).toBe(1);

  const api = await ctx();
  await loginLine(api, "Udev-customer-2");
  const qt = await createQuote(api, {
    service_type: "daily_charter", car_type: "sedan", origin: PLACES.silom, pickup_at: futurePickup(35),
    hours: 10, pax: 2, luggage: 1, child_seats: 0,
  });
  const a = await acceptQuote(api, qt.id);
  const [b] = await q<{ source_platform: string; slug: string; click: string }>(
    `select b.source_platform, c.slug, t.click_id as click from bookings b
       join campaigns c on c.id = b.campaign_id join touchpoints t on t.id = b.last_touch_id where b.id = $1`, [a.booking_id]);
  expect(b).toEqual({ source_platform: "google", slug, click: "Cj0KCQ-E2E-AbC" });
  await owner.dispose();
  await api.dispose();
});
