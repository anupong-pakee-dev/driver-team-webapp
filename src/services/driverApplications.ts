import "server-only";
import type { LineIdentity } from "@/adapters/line/liffAuth";
import type { SessionUser } from "@/lib/auth";
import { encryptField, normalizeThaiPhone, phoneHash } from "@/lib/crypto";
import { SYSTEM, withTx, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";

// สมัครเป็นคนขับผ่าน QR สาธารณะ: ผู้สมัครกรอกข้อมูล (ล็อกอิน LINE) → เจ้าของอนุมัติ → สร้างบัญชีคนขับผูก LINE นั้น
// ปฏิเสธแล้วสมัครใหม่ได้ · ไม่แจ้ง LINE ตอนอนุมัติ (ประหยัดโควตา) — ผู้สมัครเปิดลิงก์/QR เดิมเพื่อดูสถานะ

export type ApplicationStatus =
  | { status: "none" }
  | { status: "pending"; nickname: string; created_at: string }
  | { status: "rejected"; reason: string }
  | { status: "driver" };

/**
 * LINE นี้ใช้เป็นคนขับได้ไหม: ยังไม่มีในระบบ หรือเป็นลูกค้าที่ยังไม่เคยขอราคา/จอง (แอดเพื่อน OA ไว้เฉย ๆ) = ได้
 * คืน id ของบัญชีลูกค้าเปล่าที่ต้องปลด LINE ออกตอนอนุมัติ
 */
async function lineUsable(db: Db, lineUserId: string, lock = false): Promise<{ ok: true; releaseUserId: string | null } | { ok: false; reason: string }> {
  const { rows } = await db.query(
    `select u.id, u.role,
            exists (select 1 from quotes q where q.customer_id = u.id)
              or exists (select 1 from bookings b where b.customer_id = u.id) as has_activity
       from users u where u.line_user_id = $1 ${lock ? "for update" : ""}`, [lineUserId]);
  const u = rows[0];
  if (!u) return { ok: true, releaseUserId: null };
  if (u.role === "driver") return { ok: false, reason: "ALREADY_DRIVER" };
  if (u.role !== "customer" || u.has_activity) return { ok: false, reason: "LINE_ALREADY_USED" };
  return { ok: true, releaseUserId: u.id };
}

export async function applicationStatus(db: Db, lineUserId: string): Promise<ApplicationStatus> {
  const { rows: d } = await db.query(`select 1 from users where line_user_id = $1 and role = 'driver'`, [lineUserId]);
  if (d[0]) return { status: "driver" };
  const { rows } = await db.query(
    `select status, nickname, reject_reason, created_at from driver_applications
      where line_user_id = $1 order by created_at desc limit 1`, [lineUserId]);
  const a = rows[0];
  if (!a || a.status === "approved") return { status: "none" };
  if (a.status === "pending") return { status: "pending", nickname: a.nickname, created_at: a.created_at };
  return { status: "rejected", reason: a.reject_reason };
}

export async function submitApplication(id: LineIdentity, input: { nickname: string; fullName: string; phone: string }) {
  const e164 = normalizeThaiPhone(input.phone);
  if (!e164) throw new BizError("VALIDATION", { field: "phone" });
  return withTx({ ...SYSTEM, reason: "driver application" }, async (db) => {
    const current = await applicationStatus(db, id.lineUserId);
    if (current.status === "driver") throw new BizError("VALIDATION", { reason: "ALREADY_DRIVER" });
    if (current.status === "pending") return current;
    const usable = await lineUsable(db, id.lineUserId);
    if (!usable.ok) throw new BizError("VALIDATION", { reason: usable.reason });
    const dup = await db.query(`select 1 from users where phone_hash = $1 and role = 'driver'`, [phoneHash(e164)]);
    if (dup.rows[0]) throw new BizError("VALIDATION", { reason: "PHONE_IN_USE" });
    await db.query(
      `insert into driver_applications (line_user_id, nickname, full_name_enc, phone_enc, phone_hash)
       values ($1, $2, $3, $4, $5)`,
      [id.lineUserId, input.nickname.trim(), encryptField(input.fullName.trim()), encryptField(e164), phoneHash(e164)]);
    return applicationStatus(db, id.lineUserId);
  });
}

/** อนุมัติ → สร้างบัญชีคนขับ (ผูก LINE ที่ใช้สมัคร) · คนขับเปิดแอปแล้วยอมรับสัญญา + ส่งเอกสารต่อได้เลย */
export async function approveApplication(owner: SessionUser, applicationId: string) {
  return withTx({ userId: owner.id, role: owner.role, reason: "approve driver application" }, async (db) => {
    const { rows } = await db.query(`select * from driver_applications where id = $1 for update`, [applicationId]);
    const a = rows[0];
    if (!a) throw new BizError("NOT_FOUND");
    if (a.status !== "pending") throw new BizError("INVALID_TRANSITION");
    const usable = await lineUsable(db, a.line_user_id, true);
    if (!usable.ok) throw new BizError("VALIDATION", { reason: usable.reason });
    const dup = await db.query(`select 1 from users where phone_hash = $1 and role = 'driver'`, [a.phone_hash]);
    if (dup.rows[0]) throw new BizError("VALIDATION", { reason: "PHONE_IN_USE" });
    if (usable.releaseUserId) await db.query(`update users set line_user_id = null where id = $1`, [usable.releaseUserId]);
    const { rows: u } = await db.query(
      `insert into users (auth_user_id, role, line_user_id, display_name, full_name_enc, phone_enc, phone_hash)
       values (gen_random_uuid(), 'driver', $1, $2, $3, $4, $5) returning id`,
      [a.line_user_id, a.nickname, a.full_name_enc, a.phone_enc, a.phone_hash]);
    await db.query(`insert into drivers (user_id) values ($1)`, [u[0].id]);
    await db.query(
      `update driver_applications set status = 'approved', user_id = $2, decided_by = $3, decided_at = now() where id = $1`,
      [applicationId, u[0].id, owner.id]);
    return { driverId: u[0].id as string };
  });
}

export async function rejectApplication(owner: SessionUser, applicationId: string, reason: string) {
  return withTx({ userId: owner.id, role: owner.role, reason: "reject driver application" }, async (db) => {
    const r = await db.query(
      `update driver_applications set status = 'rejected', reject_reason = $2, decided_by = $3, decided_at = now()
        where id = $1 and status = 'pending'`, [applicationId, reason.trim(), owner.id]);
    if (!r.rowCount) throw new BizError("NOT_FOUND");
  });
}
