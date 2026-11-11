import "server-only";
import { remove } from "@/adapters/storage";
import type { SessionUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { log } from "@/lib/redact";

// เจ้าของลบคนขับ (PDPA: สิทธิ์ขอลบข้อมูล)
// - ยังไม่เคยมีงาน/ข้อเสนองาน/ยอดจ่าย → ลบทั้งบัญชีจริง ("deleted")
// - เคยมีประวัติงาน → เก็บประวัติงาน/เงินไว้ทำบัญชี แต่ลบข้อมูลส่วนตัว + ไฟล์เอกสาร + บล็อกบัญชี ("anonymized")
// งานที่ยังไม่จบอยู่ในมือคนขับ → ไม่ให้ลบ (ต้องย้ายงานให้คนอื่นก่อน)

export const REMOVED_DRIVER_NAME = "คนขับที่ลบแล้ว";
const OPEN_STATUSES = ["awaiting_deposit", "confirmed", "assigned", "en_route", "arrived", "picked_up", "dropped_off", "disputed"];

export type RemovalResult = { mode: "deleted" | "anonymized"; files: number; fileError?: boolean };

export async function removeDriver(owner: SessionUser, driverId: string, reason: string): Promise<RemovalResult> {
  const { mode, files } = await withTx({ userId: owner.id, role: owner.role, reason: `remove driver: ${reason}` }, async (db) => {
    const u = await db.query(`select id, line_user_id from users where id = $1 and role = 'driver' for update`, [driverId]);
    if (!u.rows[0]) throw new BizError("NOT_FOUND");
    const lineId: string | null = u.rows[0].line_user_id;

    const open = await db.query(
      `select count(*)::int as n from bookings
        where (driver_id = $1 or backup_driver_id = $1) and status::text = any($2)`, [driverId, OPEN_STATUSES]);
    if (open.rows[0].n > 0) throw new BizError("BUSINESS_RULE", { rule: "DRIVER_HAS_OPEN_JOBS", count: open.rows[0].n });

    const hist = await db.query(
      `select exists (select 1 from bookings where driver_id = $1 or backup_driver_id = $1)
           or exists (select 1 from job_offers where driver_id = $1)
           or exists (select 1 from payouts where driver_id = $1)
           or exists (select 1 from contact_reveals where driver_id = $1)
           or exists (select 1 from incidents where reported_by = $1) as has_history`, [driverId]);
    const mode: RemovalResult["mode"] = hist.rows[0].has_history ? "anonymized" : "deleted";

    // ไฟล์เอกสารของคนขับและรถทุกคัน → ลบหลัง commit
    const docs = await db.query(
      `select id, file_path from documents
        where (owner_type = 'driver' and owner_id = $1)
           or (owner_type = 'vehicle' and owner_id in (select id from vehicles where driver_id = $1))`, [driverId]);
    const files = docs.rows.map((d) => d.file_path as string);
    await db.query(`delete from documents where id = any($1)`, [docs.rows.map((d) => d.id)]);

    // ข้อความ LINE ที่ยังไม่ส่ง → ยกเลิก · ข้อความเก่า → ลบ LINE ID ออกจาก payload
    if (lineId) {
      await db.query(
        `update outbox set status = 'dead', last_error = 'driver removed'
          where status in ('pending','failed') and payload->>'to' = $1`, [lineId]);
      await db.query(`update outbox set payload = jsonb_set(payload, '{to}', '"removed"') where payload->>'to' = $1`, [lineId]);
    }
    await db.query(`delete from availability where driver_id = $1`, [driverId]);
    await db.query(`update bookings set preferred_driver_id = null where preferred_driver_id = $1`, [driverId]);
    await db.query(`update touchpoints set user_id = null where user_id = $1`, [driverId]);

    if (mode === "deleted") {
      await db.query(`delete from driver_invites where user_id = $1`, [driverId]);
      await db.query(`delete from consents where user_id = $1`, [driverId]);
      await db.query(`delete from data_requests where user_id = $1`, [driverId]);
      await db.query(`delete from vehicles where driver_id = $1`, [driverId]);
      await db.query(`delete from drivers where user_id = $1`, [driverId]);
      await db.query(`delete from users where id = $1`, [driverId]);
    } else {
      await db.query(`update job_offers set result = 'withdrawn' where driver_id = $1 and result = 'pending'`, [driverId]);
      await db.query(`update driver_invites set expires_at = least(expires_at, now()) where user_id = $1 and used_at is null`, [driverId]);
      // รถ: เก็บทะเบียน/ประเภทไว้คู่ประวัติงาน · ปิดใช้งาน · ลบข้อมูลเจ้าของ/กรมธรรม์
      await db.query(
        `update vehicles set active = false, owner_name = null, voluntary_policy_no = null, insurance_claim_phone = null
          where driver_id = $1`, [driverId]);
      await db.query(
        `update drivers set public_license_no_enc = null, bank_account_enc = null, bank_account_last4 = null
          where user_id = $1`, [driverId]);
      await db.query(
        `update users set status = 'blocked', line_user_id = null, display_name = $2,
                          full_name_enc = null, phone_enc = null, phone_hash = null
          where id = $1`, [driverId, REMOVED_DRIVER_NAME]);
    }
    return { mode, files };
  });

  if (!files.length) return { mode, files: 0 };
  try {
    await remove("kyc-docs", files);
    return { mode, files: files.length };
  } catch (e) {
    // ข้อมูลในฐานข้อมูลถูกลบแล้ว — ไฟล์ค้างให้แจ้งเจ้าของ (ลบเองใน Supabase Storage ได้)
    log.error("driver removal: storage cleanup failed", { error: (e as Error).message, count: files.length });
    return { mode, files: files.length, fileError: true };
  }
}
