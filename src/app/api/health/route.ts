import { NextResponse } from "next/server";
import { pool } from "@/lib/db";

// §14 uptime monitor: 200 = ใช้งานได้ · 503 = ฐานข้อมูลล่ม · ไม่มีข้อมูลส่วนบุคคล
export const dynamic = "force-dynamic";

export async function GET() {
  const t0 = Date.now();
  try {
    const { rows } = await pool.query(
      `select (select count(*) from outbox where status = 'dead')::int as outbox_dead,
              (select count(*) from outbox where status in ('pending','failed') and next_attempt_at < now() - interval '5 minutes')::int as outbox_stuck,
              (select max(started) from job_runs where name = 'outbox_worker' and ok) as outbox_worker_last_ok`);
    const r = rows[0];
    return NextResponse.json(
      { ok: true, db: "up", db_ms: Date.now() - t0, outbox_dead: r.outbox_dead, outbox_stuck: r.outbox_stuck, outbox_worker_last_ok: r.outbox_worker_last_ok },
      { headers: { "cache-control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false, db: "down" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
