import "server-only";
import { Pool, type PoolClient } from "pg";

// ใช้ pool เดียวต่อ process (dev hot-reload ไม่สร้างซ้ำ)
const g = globalThis as unknown as { __pgPool?: Pool };
export const pool: Pool =
  g.__pgPool ??
  (g.__pgPool = new Pool({ connectionString: process.env.DATABASE_URL, max: Number(process.env.DB_POOL_MAX) || 10 }));

// connection ที่ว่างอยู่หลุด (DB restart / failover) → ไม่ให้ทั้ง process ล้ม
if (!(pool as unknown as { __errHandler?: boolean }).__errHandler) {
  pool.on("error", (e) => console.error("pg pool idle client error:", e.message));
  (pool as unknown as { __errHandler?: boolean }).__errHandler = true;
}

export type Db = PoolClient;
export type Actor = { userId: string | null; role: string; reason?: string };

export const SYSTEM: Actor = { userId: null, role: "system" };

/**
 * เขียนข้อมูลใน transaction เดียว พร้อมตั้ง actor ให้ audit trigger (§4.4)
 * ใช้สิทธิ์ของ server — การตรวจสิทธิ์ต้องทำใน service ก่อนเรียก
 */
export async function withTx<T>(actor: Actor, fn: (db: Db) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin");
    await c.query(
      `select set_config('app.actor_id', $1, true), set_config('app.actor_role', $2, true), set_config('app.reason', $3, true)`,
      [actor.userId ?? "", actor.role, actor.reason ?? ""],
    );
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/**
 * อ่านข้อมูลในนามผู้ใช้ผ่าน RLS (P2: ฐานข้อมูลเป็นด่านสุดท้าย)
 * authUserId = users.auth_user_id · null = anon
 */
export async function asUser<T>(authUserId: string | null, fn: (db: Db) => Promise<T>): Promise<T> {
  const c = await pool.connect();
  try {
    await c.query("begin read only");
    const claims = authUserId ? { sub: authUserId, role: "authenticated" } : { role: "anon" };
    await c.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    await c.query(authUserId ? "set local role authenticated" : "set local role anon");
    const result = await fn(c);
    await c.query("commit");
    return result;
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}
