import { expect, test } from "@playwright/test";
import { BASE, closeDb, ctx, loginStaff, q } from "./helpers";

// หน้าภาพรวมการใช้งาน + นับผู้เข้าชมแบบไม่ระบุตัวตน
test.afterAll(closeDb);

test("customer page views are counted anonymously; back office and bots are not", async ({ page }) => {
  const before = (await q<{ n: number }>(`select count(*)::int as n from page_views`))[0].n;
  await page.goto(`${BASE}/`);
  await page.goto(`${BASE}/privacy`);
  await expect.poll(async () => (await q<{ n: number }>(`select count(*)::int as n from page_views`))[0].n).toBe(before + 2);

  const rows = await q<{ path: string; visitor: string }>(`select path, visitor from page_views order by id desc limit 2`);
  expect(rows.map((r) => r.path).sort()).toEqual(["/", "/privacy"]);
  expect(rows[0].visitor).toBe(rows[1].visitor);          // คนเดียวกันในวันเดียวกัน
  expect(rows[0].visitor).not.toMatch(/\d+\.\d+\.\d+\.\d+/); // ไม่ใช่ IP

  const api = await ctx();
  expect((await api.post("/api/pv", { data: { path: "/admin/usage" } })).status()).toBe(204);
  expect((await api.post("/api/pv", { data: { path: "/" }, headers: { "user-agent": "Googlebot/2.1" } })).status()).toBe(204);
  expect((await api.post("/api/pv", { data: { path: "/liff/customer/quotes/123e4567-e89b-42d3-a456-426614174000" } })).status()).toBe(204);
  const latest = await q<{ path: string }>(`select path from page_views where id > (select max(id) - 3 from page_views) order by id`);
  expect(latest.map((r) => r.path)).toContain("/liff/customer/quotes/:id");
  expect(latest.map((r) => r.path)).not.toContain("/admin/usage");
  await api.dispose();
});

test("owner sees quotas, visitors and month figures", async ({ page, context }) => {
  const owner = await ctx();
  await loginStaff(owner, "owner@example.test");
  const { cookies } = await owner.storageState();
  await context.addCookies(cookies);
  await page.goto(`${BASE}/admin/usage`);
  await expect(page.getByRole("heading", { name: "ภาพรวมการใช้งาน" })).toBeVisible();
  for (const title of ["โควตาบริการ (เดือนนี้)", "ผู้เข้าชมเว็บ (หน้าลูกค้า)", "ธุรกิจเดือนนี้", "คนขับ"]) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  await expect(page.getByText("ฐานข้อมูล Supabase")).toBeVisible();
  await expect(page.getByRole("meter", { name: "ฐานข้อมูล Supabase" })).toBeVisible();
  // local ไม่มี LINE token → แจ้งว่ายังไม่เชื่อมต่อ แทนการพัง
  await expect(page.getByText(/ยังไม่ได้เชื่อมต่อ LINE|ใช้ไป/).first()).toBeVisible();
  await owner.dispose();
});

test("customers cannot open the usage page", async ({ page }) => {
  await page.goto(`${BASE}/admin/usage`);
  await expect(page).toHaveURL(/\/admin\/login/);
});
