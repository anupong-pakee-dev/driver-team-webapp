import { expect, test, type APIRequestContext } from "@playwright/test";
import { closeDb, ctx, loginStaff, q } from "./helpers";

// QR สาธารณะ: คนขับสมัครเอง (ล็อกอิน LINE) → เจ้าของอนุมัติ → เข้าแอปคนขับได้ · ปฏิเสธแล้วสมัครใหม่ได้
const line = `Udev-apply-${Date.now()}`;
const token = `dev:${line}`;
const phone = `08${String(Date.now()).slice(-8)}`;
// ล็อกอินหลังบ้านครั้งเดียวต่อบทบาท (จำกัด 10 ครั้ง/15 นาที ต่อ IP)
let owner: APIRequestContext;
let sales: APIRequestContext;
test.beforeAll(async () => {
  owner = await ctx();
  await loginStaff(owner, "owner@example.test");
  sales = await ctx();
  await loginStaff(sales, "sales@example.test");
});
test.afterAll(async () => {
  await owner.dispose();
  await sales.dispose();
  await closeDb();
});

test("a driver applies from the QR page, the owner approves, and the driver can sign in", async () => {
  const anon = await ctx();
  const status = async () => (await (await anon.post("/api/driver-applications/status", { data: { id_token: token } })).json()).status;
  expect(await status()).toBe("none");

  // ต้องยินยอมก่อน
  expect((await anon.post("/api/driver-applications", { data: { id_token: token, nickname: "ทดสอบ", full_name: "นาย ทดสอบ สมัคร", phone, consent: false } })).status()).toBe(400);
  const sent = await anon.post("/api/driver-applications", { data: { id_token: token, nickname: "ทดสอบ", full_name: "นาย ทดสอบ สมัคร", phone, consent: true } });
  expect(sent.status()).toBe(201);
  expect((await sent.json()).status).toBe("pending");
  expect(await status()).toBe("pending");

  // ยังไม่อนุมัติ → เข้าแอปคนขับไม่ได้
  expect((await anon.post("/api/auth/liff", { data: { id_token: token, app: "driver" } })).ok()).toBe(false);

  // แอดมินขายอนุมัติไม่ได้ · เจ้าของอนุมัติ
  const [app] = await q<{ id: string }>(`select id from driver_applications where line_user_id = $1 and status = 'pending'`, [line]);
  expect((await sales.post(`/api/admin/driver-applications/${app.id}/approve`)).status()).toBe(403);
  // หน้าคนขับของเจ้าของแสดงผู้สมัคร + QR
  const page = await (await owner.get("/admin/drivers")).text();
  expect(page).toContain("นาย ทดสอบ สมัคร");
  expect(page).toContain("QR สมัครเป็นคนขับ");
  expect((await owner.post(`/api/admin/driver-applications/${app.id}/approve`)).ok()).toBe(true);

  expect(await status()).toBe("driver");
  const [u] = await q<{ role: string; display_name: string }>(`select role, display_name from users where line_user_id = $1`, [line]);
  expect(u).toEqual({ role: "driver", display_name: "ทดสอบ" });
  // ล็อกอินแอปคนขับด้วย LINE เดิมได้แล้ว
  expect((await anon.post("/api/auth/liff", { data: { id_token: token, app: "driver" } })).ok()).toBe(true);
  // สมัครซ้ำไม่ได้
  const again = await anon.post("/api/driver-applications", { data: { id_token: `dev:${line}`, nickname: "x", full_name: "x x", phone, consent: true } });
  expect((await again.json()).error.details.reason).toBe("ALREADY_DRIVER");

  await anon.dispose();
});

test("a rejected applicant sees the reason and can apply again", async () => {
  const other = `${line}-r`;
  const anon = await ctx();
  const body = { id_token: `dev:${other}`, nickname: "ปฏิเสธ", full_name: "นาย ปฏิเสธ ทดสอบ", phone: `09${String(Date.now()).slice(-8)}`, consent: true };
  expect((await anon.post("/api/driver-applications", { data: body })).status()).toBe(201);
  const [app] = await q<{ id: string }>(`select id from driver_applications where line_user_id = $1`, [other]);
  expect((await owner.post(`/api/admin/driver-applications/${app.id}/reject`, { data: { reason: "ใบขับขี่ไม่ใช่ประเภทสาธารณะ" } })).ok()).toBe(true);
  const st = await (await anon.post("/api/driver-applications/status", { data: { id_token: `dev:${other}` } })).json();
  expect(st).toEqual({ status: "rejected", reason: "ใบขับขี่ไม่ใช่ประเภทสาธารณะ" });
  expect((await anon.post("/api/driver-applications", { data: body })).status()).toBe(201);
  await anon.dispose();
});
