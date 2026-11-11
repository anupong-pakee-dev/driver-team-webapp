import "server-only";
import { createHash, randomBytes } from "node:crypto";
import type { LineIdentity } from "@/adapters/line/liffAuth";
import type { SessionUser } from "@/lib/auth";
import { encryptField, normalizeThaiPhone, phoneHash } from "@/lib/crypto";
import { withTx, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";

// FR-DRV-01 เชิญ · FR-DRV-04 สัญญา/PDPA · FR-DRV-05 ตรวจประวัติ · FR-VEH-01 รถ · FR-DISP-04 ปฏิทิน

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createInvite(owner: SessionUser, input: { nickname: string; fullName: string; phone: string }) {
  const e164 = normalizeThaiPhone(input.phone);
  if (!e164) throw new BizError("VALIDATION", { field: "phone" });
  const ttl = (await getSetting<{ invite_ttl_hours?: number }>("compliance"))?.invite_ttl_hours ?? 72;
  const token = randomBytes(24).toString("base64url");

  const userId = await withTx({ userId: owner.id, role: owner.role, reason: "invite driver" }, async (db) => {
    const dup = await db.query(`select 1 from users where phone_hash = $1 and role = 'driver'`, [phoneHash(e164)]);
    if (dup.rows[0]) throw new BizError("VALIDATION", { field: "phone", problem: "duplicate" });
    const { rows } = await db.query(
      `insert into users (auth_user_id, role, display_name, full_name_enc, phone_enc, phone_hash)
       values (gen_random_uuid(), 'driver', $1, $2, $3, $4) returning id`,
      [input.nickname, encryptField(input.fullName), encryptField(e164), phoneHash(e164)],
    );
    await db.query(`insert into drivers (user_id) values ($1)`, [rows[0].id]);
    await db.query(
      `insert into driver_invites (user_id, token_hash, created_by, expires_at)
       values ($1, $2, $3, now() + make_interval(hours => $4))`,
      [rows[0].id, hashToken(token), owner.id, ttl],
    );
    return rows[0].id as string;
  });
  return { userId, token, ttlHours: ttl };
}

/** ออกลิงก์ใหม่ให้คนขับที่ยังไม่ผูก LINE (ลิงก์เก่าใช้ไม่ได้ทันที) */
export async function reissueInvite(owner: SessionUser, driverId: string) {
  const ttl = (await getSetting<{ invite_ttl_hours?: number }>("compliance"))?.invite_ttl_hours ?? 72;
  const token = randomBytes(24).toString("base64url");
  await withTx({ userId: owner.id, role: owner.role, reason: "reissue invite" }, async (db) => {
    const { rows } = await db.query(`select line_user_id from users where id = $1 and role = 'driver'`, [driverId]);
    if (!rows[0]) throw new BizError("NOT_FOUND");
    if (rows[0].line_user_id) throw new BizError("INVALID_TRANSITION");
    await db.query(`update driver_invites set expires_at = least(expires_at, now()) where user_id = $1 and used_at is null`, [driverId]);
    await db.query(
      `insert into driver_invites (user_id, token_hash, created_by, expires_at)
       values ($1, $2, $3, now() + make_interval(hours => $4))`,
      [driverId, hashToken(token), owner.id, ttl],
    );
  });
  return { token, ttlHours: ttl };
}

/** ใช้ลิงก์เชิญตอน login LIFF: ผูก LINE กับบัญชีคนขับ (ครั้งเดียว) */
export async function redeemInvite(db: Db, token: string, id: LineIdentity): Promise<string> {
  const { rows } = await db.query(
    `select i.id, i.user_id, i.expires_at, i.used_at from driver_invites i where token_hash = $1 for update`,
    [hashToken(token)],
  );
  const inv = rows[0];
  if (!inv) throw new BizError("FORBIDDEN", { reason: "INVITE_INVALID" });
  if (inv.used_at) throw new BizError("FORBIDDEN", { reason: "INVITE_USED" });
  if (new Date(inv.expires_at) <= new Date()) throw new BizError("FORBIDDEN", { reason: "INVITE_EXPIRED" });

  const taken = await db.query(
    `select u.id, u.role,
            exists (select 1 from quotes q where q.customer_id = u.id)
              or exists (select 1 from bookings b where b.customer_id = u.id) as has_activity
       from users u where u.line_user_id = $1 for update`,
    [id.lineUserId],
  );
  const other = taken.rows[0];
  if (other && other.id !== inv.user_id) {
    // คนขับมักแอดเพื่อน OA ก่อนเปิดลิงก์เชิญ → webhook สร้างบัญชีลูกค้าเปล่าไว้แล้ว
    // ถ้าบัญชีนั้นยังไม่เคยขอราคา/จองเลย ให้ปลด LINE ออกมาผูกกับคนขับแทน
    if (other.role !== "customer" || other.has_activity) throw new BizError("FORBIDDEN", { reason: "LINE_ALREADY_USED" });
    await db.query(`update users set line_user_id = null where id = $1`, [other.id]);
  }

  await db.query(`update users set line_user_id = $2 where id = $1`, [inv.user_id, id.lineUserId]);
  await db.query(`update driver_invites set used_at = now() where id = $1`, [inv.id]);
  return inv.user_id;
}

export type DriverTerms = { contract_version: string; privacy_version: string };

/** FR-DRV-04: เก็บ version + เวลา + IP + LINE ID */
export async function acceptDriverTerms(user: SessionUser, meta: { ip: string | null; lineUserId: string | null }) {
  const terms = await getSetting<DriverTerms>("driver_terms");
  if (!terms) throw new BizError("INTERNAL");
  await withTx({ userId: user.id, role: user.role, reason: "accept driver terms" }, async (db) => {
    for (const [kind, version] of [["driver_contract", terms.contract_version], ["privacy", terms.privacy_version]]) {
      await db.query(
        `insert into consents (user_id, kind, version, granted, channel, meta) values ($1, $2, $3, true, 'liff', $4)`,
        [user.id, kind, version, { ip: meta.ip, line_user_id: meta.lineUserId }],
      );
    }
  });
  return terms;
}

/** ยอมรับ version ปัจจุบันแล้วหรือยัง */
export async function termsStatus(db: Db, userId: string) {
  // settings อ่านด้วยสิทธิ์ server (คนขับไม่มีสิทธิ์อ่านตาราง settings)
  const terms = await getSetting<DriverTerms>("driver_terms");
  const { rows } = await db.query(
    `select distinct on (kind) kind, version, granted from consents
      where user_id = $1 and kind in ('driver_contract','privacy') order by kind, at desc`,
    [userId],
  );
  const ok = (kind: string, v?: string) => rows.some((r) => r.kind === kind && r.granted && r.version === v);
  return { terms, accepted: ok("driver_contract", terms?.contract_version) && ok("privacy", terms?.privacy_version) };
}

/** FR-DRV-05: owner บันทึกผลตรวจประวัติ — เก็บแค่วันที่ + ผ่าน/ไม่ผ่าน */
export async function recordBackgroundCheck(owner: SessionUser, driverId: string, at: string, passed: boolean) {
  await withTx({ userId: owner.id, role: owner.role, reason: "background check" }, async (db) => {
    const { rowCount } = await db.query(
      `update drivers set background_check_at = $2, background_check_passed = $3 where user_id = $1`,
      [driverId, at, passed],
    );
    if (!rowCount) throw new BizError("NOT_FOUND");
  });
}

// ───────────── รถ ─────────────
export type VehicleInput = { car_type: string; plate: string; seats: number; luggage: number };

export async function addVehicle(user: SessionUser, v: VehicleInput) {
  return withTx({ userId: user.id, role: user.role, reason: "add vehicle" }, async (db) => {
    const dup = await db.query(`select 1 from vehicles where plate = upper(regexp_replace($1, '\\s+', '', 'g'))`, [v.plate]);
    if (dup.rows[0]) throw new BizError("VALIDATION", { field: "plate", problem: "duplicate" });
    // registration_type มาจากเล่มทะเบียนตอน owner อนุมัติ — ระหว่างนี้ใช้ค่าว่าง (ไม่อยู่ใน allowed_registrations)
    const { rows } = await db.query(
      `insert into vehicles (driver_id, car_type, plate, seats, luggage, registration_type)
       values ($1, $2, $3, $4, $5, '') returning id`,
      [user.id, v.car_type, v.plate, v.seats, v.luggage],
    );
    return rows[0].id as string;
  });
}

/** แก้ข้อมูลพื้นฐานได้เฉพาะตอนยังไม่อนุมัติ — หลังอนุมัติต้องให้ owner แก้ */
export async function updateVehicle(user: SessionUser, id: string, v: VehicleInput) {
  return withTx({ userId: user.id, role: user.role, reason: "edit vehicle" }, async (db) => {
    const { rows } = await db.query(`select kyc_status from vehicles where id = $1 and driver_id = $2 for update`, [id, user.id]);
    if (!rows[0]) throw new BizError("NOT_FOUND");
    if (rows[0].kyc_status === "approved") throw new BizError("INVALID_TRANSITION");
    await db.query(`update vehicles set car_type = $2, plate = $3, seats = $4, luggage = $5 where id = $1`,
      [id, v.car_type, v.plate, v.seats, v.luggage]);
  });
}

export async function setVehicleActive(owner: SessionUser, id: string, active: boolean, reason: string) {
  await withTx({ userId: owner.id, role: owner.role, reason }, async (db) => {
    const { rowCount } = await db.query(`update vehicles set active = $2 where id = $1`, [id, active]);
    if (!rowCount) throw new BizError("NOT_FOUND");
  });
}

// ───────────── ปฏิทิน (FR-DISP-04) ─────────────
export async function addBlock(user: SessionUser, from: string, to: string, note?: string) {
  if (!(Date.parse(to) > Date.parse(from))) throw new BizError("VALIDATION", { field: "to" });
  return withTx({ userId: user.id, role: user.role, reason: note ?? "block time" }, async (db) => {
    const clash = await db.query(`select not driver_is_free($1, $2, $3, 0) as busy`, [user.id, from, to]);
    if (clash.rows[0].busy) throw new BizError("BUSINESS_RULE", { rule: "TIME_CONFLICT" });
    const { rows } = await db.query(
      `insert into availability (driver_id, period, kind) values ($1, tstzrange($2, $3, '[)'), 'blocked') returning id`,
      [user.id, from, to],
    );
    return rows[0].id as string;
  });
}

export async function removeBlock(user: SessionUser, id: string) {
  await withTx({ userId: user.id, role: user.role, reason: "unblock time" }, async (db) => {
    const { rowCount } = await db.query(`delete from availability where id = $1 and driver_id = $2`, [id, user.id]);
    if (!rowCount) throw new BizError("NOT_FOUND");
  });
}
