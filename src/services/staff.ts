import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import type { SessionUser } from "@/lib/auth";
import { SYSTEM, withTx } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { log } from "@/lib/redact";

// เพิ่มแอดมิน: owner ออกลิงก์เชิญ → ผู้ได้รับเชิญตั้งรหัสผ่านเองที่ /admin/join
// รหัสผ่านไม่ผ่านมือ owner · ไม่ต้องใช้ SMTP (owner ส่งลิงก์ทาง LINE เอง)

export type StaffRole = "sales_admin" | "owner";
const TTL_HOURS = 72;
const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

function authAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).auth.admin;
}

export async function createStaffInvite(owner: SessionUser, input: { email: string; displayName: string; role: StaffRole }) {
  const email = input.email.trim().toLowerCase();
  const token = randomBytes(24).toString("base64url");
  await withTx({ userId: owner.id, role: owner.role, reason: "invite staff" }, async (db) => {
    // ลิงก์เก่าของอีเมลเดียวกันที่ยังไม่ใช้ → ใช้ไม่ได้ทันที
    await db.query(`update staff_invites set expires_at = least(expires_at, now()) where email = $1 and used_at is null`, [email]);
    await db.query(
      `insert into staff_invites (email, role, display_name, token_hash, created_by, expires_at)
       values ($1, $2, $3, $4, $5, now() + make_interval(hours => $6))`,
      [email, input.role, input.displayName.trim(), hashToken(token), owner.id, TTL_HOURS],
    );
  });
  return { token, ttlHours: TTL_HOURS };
}

export async function revokeStaffInvite(owner: SessionUser, inviteId: string) {
  await withTx({ userId: owner.id, role: owner.role, reason: "revoke staff invite" }, async (db) => {
    const r = await db.query(
      `update staff_invites set expires_at = now() where id = $1 and used_at is null and expires_at > now()`, [inviteId]);
    if (!r.rowCount) throw new BizError("NOT_FOUND");
  });
}

/** ข้อมูลที่หน้า /admin/join แสดงก่อนตั้งรหัสผ่าน (ไม่เปลี่ยนสถานะ) */
export async function peekStaffInvite(token: string) {
  const { rows } = await withTx({ ...SYSTEM, reason: "peek staff invite" }, (db) => db.query(
    `select email, role, display_name, expires_at, used_at from staff_invites where token_hash = $1`, [hashToken(token)]));
  const inv = rows[0];
  if (!inv) return { ok: false as const, reason: "INVITE_INVALID" };
  if (inv.used_at) return { ok: false as const, reason: "INVITE_USED" };
  if (new Date(inv.expires_at) <= new Date()) return { ok: false as const, reason: "INVITE_EXPIRED" };
  return { ok: true as const, email: inv.email as string, role: inv.role as StaffRole, displayName: inv.display_name as string };
}

/** ใช้ลิงก์เชิญ: สร้างบัญชี Auth (ยืนยันอีเมลแล้ว) + users · คืน users.id เพื่อเริ่ม session */
export async function redeemStaffInvite(token: string, password: string): Promise<string> {
  return withTx({ ...SYSTEM, reason: "redeem staff invite" }, async (db) => {
    const { rows } = await db.query(
      `select id, email, role, display_name, expires_at, used_at from staff_invites where token_hash = $1 for update`,
      [hashToken(token)]);
    const inv = rows[0];
    if (!inv) throw new BizError("FORBIDDEN", { reason: "INVITE_INVALID" });
    if (inv.used_at) throw new BizError("FORBIDDEN", { reason: "INVITE_USED" });
    if (new Date(inv.expires_at) <= new Date()) throw new BizError("FORBIDDEN", { reason: "INVITE_EXPIRED" });

    const admin = authAdmin();
    const { data, error } = await admin.createUser({ email: inv.email, password, email_confirm: true });
    if (error || !data.user) {
      if (error?.code === "email_exists" || (error?.status === 422 && /already/i.test(error.message))) {
        throw new BizError("VALIDATION", { reason: "EMAIL_EXISTS" });
      }
      if (error?.code === "weak_password") throw new BizError("VALIDATION", { reason: "WEAK_PASSWORD" });
      log.error("staff invite: auth createUser failed", { code: error?.code, status: error?.status });
      throw new BizError("INTERNAL");
    }
    try {
      const u = await db.query(
        `insert into users (auth_user_id, role, display_name) values ($1, $2, $3) returning id`,
        [data.user.id, inv.role, inv.display_name]);
      await db.query(`update staff_invites set used_at = now(), used_by = $2 where id = $1`, [inv.id, u.rows[0].id]);
      return u.rows[0].id as string;
    } catch (e) {
      // ไม่ให้เหลือบัญชี Auth ที่ไม่มีสิทธิ์ค้างอยู่ — ลบทิ้ง แล้วให้ลองลิงก์เดิมใหม่ได้
      await admin.deleteUser(data.user.id).catch(() => {});
      throw e;
    }
  });
}
