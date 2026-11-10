import { expect, test } from "@playwright/test";
import { BASE, closeDb, createQuote, ctx, loginLine, PLACES, futurePickup, q } from "./helpers";

// ฝั่งลูกค้า 3 ภาษา: เลือกจากภาษาเบราว์เซอร์ → เปลี่ยนเองได้ → ข้อความ LINE ตามภาษาในบัญชี · หลังบ้านยังเป็นไทย
test.afterAll(closeDb);

test.describe("Chinese browser", () => {
  test.use({ locale: "zh-CN" });

  test("catalog follows the browser language and the switcher changes it", async ({ page, context }) => {
    await page.goto(`${BASE}/`);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hans");
    await expect(page.getByRole("heading", { name: /包车带司机/ })).toBeVisible();
    await expect(page.getByText("轿车").first()).toBeVisible();
    await expect(page.getByRole("link", { name: "获取报价" })).toBeVisible();

    await page.getByRole("group", { name: "语言" }).getByRole("button", { name: "EN" }).click();
    await expect(page.getByRole("heading", { name: /Car with driver/ })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect((await context.cookies()).find((c) => c.name === "lang")?.value).toBe("en");
  });

  test("customer pages, saved language and LINE quote message are in Chinese", async ({ page, context }) => {
    const [c] = await q<{ id: string }>(`update users set status = 'active', locale = 'th' where line_user_id = 'Udev-customer-2' returning id`);
    expect((await context.request.post(`${BASE}/api/auth/dev`, { headers: { origin: BASE }, data: { user_id: c.id } })).ok()).toBe(true);

    await page.goto(`${BASE}/liff/customer/quote`);
    await expect(page.getByRole("heading", { name: "获取报价" })).toBeVisible();
    await expect(page.getByRole("button", { name: "📍 当前位置" }).first()).toBeVisible();

    // เลือกภาษาในหน้าลูกค้า → บันทึกในบัญชี (ใช้ส่งข้อความ LINE)
    await page.getByRole("group", { name: "语言" }).getByRole("button", { name: "EN" }).click();
    await expect(page.getByRole("heading", { name: "Get a quote" })).toBeVisible();
    await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "中文" }).click();
    await expect(page.getByRole("heading", { name: "获取报价" })).toBeVisible();
    await expect.poll(async () => (await q<{ locale: string }>(`select locale from users where id = $1`, [c.id]))[0].locale).toBe("zh");

    // ใบเสนอราคาที่ส่งเข้า LINE เป็นภาษาจีน
    const api = await ctx();
    await loginLine(api, "Udev-customer-2");
    const qt = await createQuote(api, {
      service_type: "daily_charter", car_type: "sedan", origin: PLACES.silom, pickup_at: futurePickup(40),
      hours: 10, pax: 1, luggage: 0, child_seats: 0,
    });
    const [msg] = await q<{ alt: string }>(`select payload->'messages'->0->>'altText' as alt from outbox where dedupe_key = $1`, [`quote:${qt.id}`]);
    expect(msg.alt).toMatch(/^报价单 Q-\d{4}-\d{4}/);

    await page.goto(`${BASE}/liff/customer/quotes/${qt.id}`);
    await expect(page.getByText("合计")).toBeVisible();
    await expect(page.getByText("按天包车 · 轿车")).toBeVisible();
    await api.dispose();
  });

  test("the back office stays Thai", async ({ page }) => {
    await page.goto(`${BASE}/admin/login`);
    await expect(page.getByRole("button", { name: "เข้าสู่ระบบ" })).toBeVisible();
  });
});
