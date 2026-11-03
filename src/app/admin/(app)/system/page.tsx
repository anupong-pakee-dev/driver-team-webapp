import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBangkok } from "@/lib/time";
import { Badge, Empty, Panel } from "@/components/ui";
import { RetryOutbox } from "./retry";

// §10/§14: งานอัตโนมัติรันล่าสุดเมื่อไร · ข้อความที่ส่งไม่ได้ (โทรแจ้งแทน)
// รอบที่ควรรัน (นาที) — เกิน 3 เท่า = ผิดปกติ
const JOBS: [string, number][] = [
  ["outbox_worker", 1], ["expire_offers", 1], ["expire_quotes", 5], ["expire_unpaid", 5], ["auto_complete", 15], ["reminders", 15],
  ["doc_expiry", 1440], ["future_job_guard", 1440], ["payout_build", 1440], ["cleanup", 1440], ["audit_export", 1440],
];

export default async function SystemPage() {
  const user = await requireStaffPage();
  const d = await asUser(user.authUserId, async (db) => ({
    runs: (await db.query(
      `select distinct on (name) name, started, ok, ms, error,
              (select extract(epoch from now() - max(started)) / 60 from job_runs j2 where j2.name = j.name and j2.ok) as mins_since_ok
         from job_runs j order by name, started desc`)).rows,
    outbox: (await db.query(
      `select o.id, o.topic, o.status, o.attempts, o.last_error, o.created_at, o.payload->'messages'->0->>'text' as text,
              o.payload->'messages'->0->>'altText' as alt, u.display_name, u.role
         from outbox o left join users u on u.line_user_id = o.payload->>'to'
        where o.status in ('failed','dead') order by o.created_at desc limit 100`)).rows,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ระบบ</h1>
      <Panel title="งานอัตโนมัติ">
        <ul className="divide-y divide-line text-sm">
          {JOBS.map(([name, every]) => {
            const r = d.runs.find((x) => x.name === name);
            const stale = r?.mins_since_ok == null || Number(r.mins_since_ok) > every * 3;
            return (
              <li key={name} className="flex flex-wrap items-center gap-2 py-2">
                <code className="w-40">{name}</code>
                <Badge tone={!r ? "bad" : !r.ok ? "bad" : stale ? "warn" : "ok"}>{!r ? "ไม่เคยรัน" : !r.ok ? "ล้มเหลว" : stale ? "ไม่ได้รันตามรอบ" : "ปกติ"}</Badge>
                {r && <span className="text-xs text-muted">ล่าสุด {formatBangkok(r.started)} · {r.ms} ms</span>}
                {r?.error && <span className="text-xs text-bad">{r.error}</span>}
              </li>
            );
          })}
        </ul>
        <p className="mt-2 text-xs text-muted">ตั้งตัวเรียกตามรอบใน scheduler (Vercel Cron / pg_cron) ด้วย Authorization: Bearer CRON_SECRET — ดู docs/go-live.md</p>
      </Panel>
      <Panel title={`ข้อความค้างส่ง (${d.outbox.length})`}>
        {d.outbox.length === 0 ? <Empty>ไม่มี</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {d.outbox.map((o) => (
              <li key={o.id} className="flex flex-wrap items-start gap-2 py-2">
                <Badge tone={o.status === "dead" ? "bad" : "warn"}>{o.status} · {o.attempts} ครั้ง</Badge>
                <div className="min-w-60 flex-1">
                  <div><b>{o.display_name ?? "ไม่ทราบผู้รับ"}</b> <span className="text-xs text-muted">{o.role} · {formatBangkok(o.created_at)}</span></div>
                  <div className="text-muted">{(o.text ?? o.alt ?? o.topic)?.slice(0, 160)}</div>
                  {o.last_error && <div className="text-xs text-bad">{o.last_error.slice(0, 160)}</div>}
                </div>
                <RetryOutbox id={o.id} />
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted">LINE ส่งไม่ได้ → โทรแจ้งผู้รับแทน แล้วกดส่งอีกครั้งเมื่อแก้ปัญหาแล้ว (§14)</p>
      </Panel>
    </div>
  );
}
