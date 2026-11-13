import { expect, test } from "@playwright/test";
import { BASE, closeDb, futurePickup, q } from "./helpers";

// FR-BOOK-01 ลูกค้าระบุตำแหน่งเอง 2 แบบ: ตำแหน่งปัจจุบัน (GPS) + ปักหมุดบนแผนที่ → ใบเสนอราคามีพิกัด + ระยะประมาณ
test.afterAll(closeDb);

test("customer sets pickup by GPS and drop-off by pinning on the map", async ({ page, context }) => {
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
  // มีแค่ 2 ทางเลือก: ตำแหน่งปัจจุบัน + ปักหมุด (ไม่มีวางลิงก์แล้ว)
  await expect(dest.getByRole("button")).toHaveCount(2);
  await expect(dest.getByRole("button", { name: /วางลิงก์/ })).toHaveCount(0);
  // ปักหมุด: เปิดแผนที่ → ปุ่มตำแหน่งในแผนที่พาไปพัทยา → ใช้ตำแหน่งนี้
  await context.setGeolocation({ latitude: 12.9236, longitude: 100.8825 });
  await dest.getByRole("button", { name: /ปักหมุดบนแผนที่/ }).click();
  const map = page.getByRole("dialog");
  await map.getByRole("button", { name: /ตำแหน่งปัจจุบัน/ }).click();
  await expect(map.getByText(/12\.923\d\d, 100\.882\d\d/)).toBeVisible();
  await map.getByRole("button", { name: "ใช้ตำแหน่งนี้" }).click();
  await expect(dest.getByText(/12\.923\d\d, 100\.882\d\d/)).toBeVisible();

  await page.locator('input[name="pickup_at"]').fill(futurePickup(12).slice(0, 16));
  await page.getByRole("button", { name: "ขอใบเสนอราคา" }).click();
  await page.waitForURL(/\/liff\/customer\/quotes\//);

  const id = page.url().split("/").pop()!;
  const [qt] = await q<{ origin: { name: string; lat: number; source: string }; destination: { lat: number; source: string }; distance_m: number; distance_source: string }>(
    `select origin, destination, distance_m, distance_source from quotes where id = $1`, [id]);
  expect(qt.origin).toMatchObject({ name: "หน้าสยามพารากอน ประตู 1", lat: 13.7462, source: "gps" });
  expect(qt.destination.source).toBe("pin");
  expect(qt.destination.lat).toBeCloseTo(12.9236, 3);
  expect(qt.distance_source).toBe("estimate");
  expect(qt.distance_m).toBeGreaterThan(130_000); // สยาม → พัทยา เส้นตรง ~100 กม. × 1.35
  expect(qt.distance_m).toBeLessThan(160_000);
});
