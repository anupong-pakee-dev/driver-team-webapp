import "server-only";
import { randomUUID } from "node:crypto";
import { pool, type Db } from "@/lib/db";
import { log } from "@/lib/redact";
import * as line from "@/adapters/line/messaging";

// §11 Outbox: ผลข้างเคียงภายนอกเขียนใน transaction หลัก แล้ว worker ส่งทีหลัง (P7, ADR-05)

export type Topic = "line.push" | "line.reply" | "meta.capi" | "google.dm";

export async function enqueue(db: Db, topic: Topic, payload: Record<string, unknown>, dedupeKey?: string) {
  await db.query(
    `insert into outbox (topic, payload, dedupe_key) values ($1, $2, $3) on conflict (dedupe_key) do nothing`,
    [topic, { ...payload, retry_key: randomUUID() }, dedupeKey ?? null],
  );
}

const BACKOFF_MIN = [1, 5, 15, 60, 180, 360, 720];
export const MAX_ATTEMPTS = 8;

export function nextDelayMinutes(attempts: number): number {
  return BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
}

type Row = { id: string; topic: Topic; payload: Record<string, unknown>; attempts: number };

async function deliver(row: Row) {
  const p = row.payload;
  const devNoLine = process.env.NODE_ENV !== "production" && !process.env.LINE_CHANNEL_ACCESS_TOKEN;
  switch (row.topic) {
    case "line.push":
      if (devNoLine) return log.info(`[dev] line.push skipped (no token)`, { topic: row.topic, id: row.id });
      return line.push(p.to as string, p.messages as line.LineMessage[], p.retry_key as string);
    case "line.reply":
      if (devNoLine) return log.info(`[dev] line.reply skipped (no token)`, { id: row.id });
      return line.reply(p.reply_token as string, p.messages as line.LineMessage[]);
    default:
      // meta.capi / google.dm มาในเฟส 2
      throw new Error(`no handler for topic ${row.topic}`);
  }
}

/** หยิบงานที่ถึงเวลาแบบ skip locked → ส่ง → อัปเดตผล · รันซ้อนกันได้ไม่ส่งซ้ำ */
export async function processOutbox(limit = 20) {
  const c = await pool.connect();
  const stats = { sent: 0, failed: 0, dead: 0 };
  try {
    await c.query("begin");
    const { rows } = await c.query<Row>(
      `select id, topic, payload, attempts from outbox
        where status in ('pending','failed') and next_attempt_at <= now()
        order by next_attempt_at
        for update skip locked
        limit $1`,
      [limit],
    );
    for (const row of rows) {
      try {
        await deliver(row);
        await c.query(`update outbox set status = 'sent', attempts = attempts + 1, last_error = null where id = $1`, [row.id]);
        stats.sent++;
      } catch (e) {
        const attempts = row.attempts + 1;
        const dead = attempts >= MAX_ATTEMPTS;
        await c.query(
          `update outbox set status = $2, attempts = $3, last_error = $4,
                 next_attempt_at = now() + make_interval(mins => $5) where id = $1`,
          [row.id, dead ? "dead" : "failed", attempts, String((e as Error).message).slice(0, 500), nextDelayMinutes(attempts)],
        );
        if (dead) stats.dead++;
        else stats.failed++;
        log.warn("outbox delivery failed", { id: row.id, topic: row.topic, attempts, error: (e as Error).message });
      }
    }
    await c.query("commit");
  } catch (e) {
    await c.query("rollback").catch(() => {});
    throw e;
  } finally {
    c.release();
  }
  return stats;
}
