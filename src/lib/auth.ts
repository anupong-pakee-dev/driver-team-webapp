import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignJWT, jwtVerify } from "jose";
import { cache } from "react";
import type { Locale } from "@/i18n";
import { pool } from "./db";
import { BizError } from "./errors";

// §8.1 session cookie (httpOnly, Secure, SameSite=Lax) ใช้ร่วมกันทั้ง LIFF และหลังบ้าน

export type Role = "customer" | "corporate_customer" | "driver" | "sales_admin" | "owner" | "partner";
export const STAFF: Role[] = ["sales_admin", "owner"];

export type SessionUser = {
  id: string;
  authUserId: string;
  role: Role;
  displayName: string | null;
  locale: Locale;
};

const COOKIE = "sid";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be at least 32 chars");
  return new TextEncoder().encode(s);
}

async function sessionHours(): Promise<number> {
  const { rows } = await pool.query(`select value from settings where key = 'session_hours'`);
  return Number(rows[0]?.value ?? 12);
}

export async function startSession(userId: string, channel: "liff" | "admin" | "dev") {
  const hours = await sessionHours();
  const token = await new SignJWT({ ch: channel })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${hours}h`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: hours * 3600,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

/**
 * อ่าน session + ตรวจกับ DB ทุก request (ผู้ใช้ที่ถูกระงับหลุดทันที)
 * cache() ของ React: layout กับ page ใน request เดียวกันใช้ผลเดียวกัน ไม่ query ซ้ำ
 */
export const currentUser = cache(async function currentUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let userId: string;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    userId = payload.sub;
  } catch {
    return null;
  }
  const { rows } = await pool.query(
    `select id, auth_user_id, role, display_name, locale from users where id = $1 and status = 'active'`,
    [userId],
  );
  const u = rows[0];
  if (!u) return null;
  return { id: u.id, authUserId: u.auth_user_id, role: u.role, displayName: u.display_name, locale: u.locale };
});

export async function requireUser(roles?: Role[]): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new BizError("UNAUTHENTICATED");
  if (roles && !roles.includes(u.role)) throw new BizError("FORBIDDEN");
  return u;
}

/**
 * สำหรับหน้าหลังบ้าน (Server Component): ไม่มี session ที่ใช้ได้ → ไปหน้า login · ไม่มีสิทธิ์หน้านี้ → กลับกล่องงาน
 * ต้องเรียกในทุก page — layout กับ page render พร้อมกัน redirect ใน layout จึงไม่หยุด page
 * (เกิดได้เมื่อ cookie ยังอยู่แต่ session หมดอายุ/ผู้ใช้ถูกระงับ/ฐานข้อมูล local ถูก reset)
 */
export async function requireStaffPage(roles: Role[] = STAFF): Promise<SessionUser> {
  const u = await currentUser();
  if (!u || !STAFF.includes(u.role)) redirect("/admin/login");
  if (!roles.includes(u.role)) redirect("/admin");
  return u;
}
