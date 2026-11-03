import "server-only";
import type { NextRequest } from "next/server";
import { pool } from "./db";
import { BizError } from "./errors";

// §8.3 rate limit (fixed window ใน Postgres) — ไม่ผูกกับหน่วยความจำของ instance

export const clientIp = (req: NextRequest) =>
  req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";

/** เกินโควตา → BizError RATE_LIMITED (429) */
export async function rateLimit(key: string, limit: number, windowSeconds: number) {
  const { rows } = await pool.query(`select rate_hit($1, $2) as n`, [key, windowSeconds]);
  if (rows[0].n > limit) throw new BizError("RATE_LIMITED", { retry_after_seconds: windowSeconds });
}
