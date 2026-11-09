import { expect, test } from "@playwright/test";
import { BASE, closeDb, futurePickup, q } from "./helpers";

// FR-BOOK-01 ลูกค้าระบุตำแหน่งเอง (ไม่ใช้ API แผนที่): GPS + วางพิกัด/ลิงก์ → ใบเสนอราคามีพิกัด + ระยะประมาณ
test.afterAll(closeDb);

test("customer sets pickup by GPS and drop-off by pasted coordinates", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"], { origin: BASE });
  await context.setGeolocation({ latitude: 13.7462, longitude: 100.5347 }); // สยาม

  // ลูกค้า ข (ลูกค้า ก ใช้โควตาขอราคา 10 ครั้ง/ชม. ในเทสต์อื่นแล้ว)
  const [c] = await q<{ id: string }>(`update users set status = 'active' where line_user_id = 'Udev-customer-2' returning id`);
  expect((await context.request.post(`${BASE}/api/auth/dev`, { headers: { origin: BASE }, data: { user_id: c.id } })).ok()).toBe(true);
  await page.goto(`${BASE}/liff/customer/quote?service=point_to_point`);

  const origin = page.getByRole("group", { name: /ต้นทาง/ });
  await origin.getByRole("button", { name: /ตำแหน่งปัจจุบัน/ }).click();
  await expect(origin.getByText("13.74620, 100.53470")).toBeVisible();
  await origin.getByRole("textbox").fill("หน้าสยามพารากอน ประตู 1");

  const dest = page.getByRole("group", { name: /ปลายทาง/ });
  await dest.getByRole("button", { name: /วางลิงก์/ }).click();
  await dest.getByRole("textbox", { name: /ลิงก์ Google Maps/ }).fill("https://www.google.com/maps/place/Pattaya/@12.9236,100.8825,13z");
  await dest.getByRole("button", { name: "ใช้ลิงก์นี้" }).click();
  await expect(dest.getByText("12.92360, 100.88250")).toBeVisible();
  await expect(dest.getByRole("textbox")).toHaveValue("Pattaya");

  // ลิงก์ที่ไม่มีพิกัด → แจ้งให้ใช้วิธีอื่น
  await page.getByRole("button", { name: "+ เพิ่มจุดแวะ" }).click();
  const stop = page.getByRole("group", { name: /จุดแวะ 1/ });
  await stop.getByRole("button", { name: /วางลิงก์/ }).click();
  await stop.getByRole("textbox", { name: /ลิงก์ Google Maps/ }).fill("https://www.google.com/maps/search/?api=1&query=Siam");
  await stop.getByRole("button", { name: "ใช้ลิงก์นี้" }).click();
  await expect(stop.getByRole("alert")).toContainText("อ่านพิกัดจากลิงก์นี้ไม่ได้");
  await page.getByRole("button", { name: "ลบจุดแวะนี้" }).click();

  await page.locator('input[name="pickup_at"]').fill(futurePickup(12).slice(0, 16));
  await page.getByRole("button", { name: "ขอใบเสนอราคา" }).click();
  await page.waitForURL(/\/liff\/customer\/quotes\//);

  const id = page.url().split("/").pop()!;
  const [qt] = await q<{ origin: { name: string; lat: number; source: string }; destination: { lat: number; source: string }; distance_m: number; distance_source: string }>(
    `select origin, destination, distance_m, distance_source from quotes where id = $1`, [id]);
  expect(qt.origin).toMatchObject({ name: "หน้าสยามพารากอน ประตู 1", lat: 13.7462, source: "gps" });
  expect(qt.destination).toMatchObject({ lat: 12.9236, source: "link" });
  expect(qt.distance_source).toBe("estimate");
  expect(qt.distance_m).toBeGreaterThan(130_000); // สยาม → พัทยา เส้นตรง ~100 กม. × 1.35
  expect(qt.distance_m).toBeLessThan(160_000);
});
