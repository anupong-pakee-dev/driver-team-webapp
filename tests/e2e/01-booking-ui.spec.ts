import { expect, test } from "@playwright/test";
import { airport, BASE, closeDb, createQuote, ctx, futurePickup, loginLine, q } from "./helpers";

// §15 (1) จอง → มัดจำ → ยืนยัน — ผ่านหน้าจอลูกค้าบนมือถือ
test.afterAll(closeDb);

test("customer accepts a quote, pays the deposit and gets a receipt", async ({ page }) => {
  // สร้างใบเสนอราคาผ่าน API แล้วทำขั้นที่เหลือบนหน้าจอ
  const api = await ctx();
  const userId = await loginLine(api, "Udev-customer-1");
  const qt = await createQuote(api, airport("suv", futurePickup(20)));

  const [u] = await q<{ id: string }>(`select id from users where id = $1`, [userId]);
  await page.goto(`${BASE}/dev/login`);
  await page.getByText("ลูกค้า ก").click();
  await page.waitForURL(/\/liff\/customer/);
  expect(u).toBeTruthy();

  await page.goto(`${BASE}/liff/customer/quotes/${qt.id}`);
  await expect(page.getByRole("heading", { name: /Q-\d{4}-\d{4}/ })).toBeVisible();
  await page.getByRole("checkbox").first().check();
  await page.getByRole("button", { name: "ยืนยันและไปหน้าชำระมัดจำ" }).click();

  await page.waitForURL(/\/liff\/customer\/bookings\//);
  await expect(page.getByText("รอมัดจำ")).toBeVisible();
  await expect(page.locator("svg").filter({ has: page.locator("path") }).first()).toBeVisible(); // QR พร้อมเพย์

  await page.getByRole("button", { name: /จำลองสลิปที่ถูกต้อง/ }).click();
  await expect(page.getByText(/ยืนยันแล้ว/)).toBeVisible();
  await expect(page.getByText(/R-\d{4}-\d{4}/)).toBeVisible();

  const bookingId = page.url().split("/").pop()!;
  const [b] = await q<{ status: string; n: number }>(
    `select b.status, (select count(*)::int from receipts r join payments p on p.id = r.payment_id where p.booking_id = b.id) as n
       from bookings b where b.id = $1`, [bookingId]);
  expect(b.status).toBe("confirmed");
  expect(b.n).toBe(1);
  await api.dispose();
});
