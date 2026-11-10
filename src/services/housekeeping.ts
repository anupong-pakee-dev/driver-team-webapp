import "server-only";
import { createClient } from "@supabase/supabase-js";
import { pool } from "@/lib/db";
import { bangkokToday } from "./compliance";

// §10 idempotency_cleanup (ทุกวัน) · audit_export (ทุกวัน 02:00 — FR-AUDIT-02)

export async function cleanup() {
  const idem = await pool.query(`delete from idempotency_keys where created_at < now() - interval '24 hours'`);
  const rate = await pool.query(`delete from rate_limits where window_start < now() - interval '1 day'`);
  const routes = await pool.query(
    `delete from route_cache where created_at < now() - make_interval(days => coalesce((select (value #>> '{}')::int from settings where key = 'route_cache_days'), 7))`);
  const runs = await pool.query(`delete from job_runs where started < now() - interval '30 days'`);
  // สถิติผู้เข้าชม (ไม่ระบุตัวตน) เก็บ 13 เดือนพอเทียบปีต่อปี
  const views = await pool.query(`delete from page_views where at < now() - interval '400 days'`);
  return { idempotency_keys: idem.rowCount, rate_limits: rate.rowCount, route_cache: routes.rowCount, job_runs: runs.rowCount, page_views: views.rowCount };
}

/**
 * export audit_logs ของเมื่อวาน (เวลาไทย) เป็น JSONL ไปที่ bucket audit-exports
 * ผู้ดูแลฐานข้อมูลระดับสูงสุดข้าม trigger append-only ได้เสมอ → สำเนานอกฐานข้อมูลคือหลักฐาน
 * ❓ production: ใช้ที่เก็บภายนอกแบบเขียนครั้งเดียว (object lock) แยกบัญชีจากฐานข้อมูล
 */
export async function auditExport(day?: string) {
  const d = day ?? new Date(Date.parse(`${bangkokToday()}T00:00:00+07:00`) - 86_400_000).toISOString().slice(0, 10);
  const { rows } = await pool.query(
    `select row_to_json(a)::text as j from audit_logs a
      where (a.at at time zone 'Asia/Bangkok')::date = $1::date order by a.id`, [d]);
  const body = rows.map((r) => r.j).join("\n") + (rows.length ? "\n" : "");
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // upsert: รันซ้ำวันเดิมได้ (ข้อมูลของวันที่ผ่านไปแล้วไม่เปลี่ยน เพราะ audit_logs append-only)
  const { error } = await sb.storage.from("audit-exports").upload(`${d.slice(0, 7)}/audit-${d}.jsonl`, body,
    { contentType: "application/x-ndjson", upsert: true });
  if (error) throw new Error(`audit export upload failed: ${error.message}`);
  return { day: d, rows: rows.length };
}
