import Link from "next/link";
import { projectMonthEnd, quotaLevel } from "@/domain/analytics";
import { requireStaffPage } from "@/lib/auth";
import { formatBaht } from "@/lib/money";
import { loadUsage } from "@/services/usage";
import { Badge, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

// ภาพรวมการใช้งาน: โควตาที่เหลือของบริการภายนอก · ผู้เข้าชมเว็บ (ไม่ระบุตัวตน) · ตัวเลขเดือนนี้ · คนขับ · ระบบ
const LEVEL = { ok: ["ปกติ", "ok"], warn: ["ใกล้เต็ม", "warn"], bad: ["เกือบหมด", "bad"] } as const;
const BAR = { ok: "bg-navy", warn: "bg-warn", bad: "bg-bad" } as const;
const LANG: Record<string, string> = { th: "ไทย", en: "English", zh: "中文", auto: "ยังไม่เลือก (ตามเครื่อง)" };

const mb = (bytes: number) => bytes / 1024 / 1024;
const fmtMb = (bytes: number) => bytes < 1024 * 1024
  ? `${Math.ceil(bytes / 1024).toLocaleString("th-TH")} KB`
  : `${mb(bytes).toLocaleString("th-TH", { maximumFractionDigits: 1 })} MB`;
const n = (v: number) => v.toLocaleString("th-TH");

function Meter({ title, used, limit, unit, detail, note }: {
  title: string; used: number; limit: number | null | undefined; unit: (v: number) => string; detail?: string; note?: string;
}) {
  const { pct, level } = quotaLevel(used, limit);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{title}</span>
        {pct !== null && <Badge tone={LEVEL[level][1]}>{LEVEL[level][0]}</Badge>}
      </div>
      <div className="text-2xl font-bold">
        {unit(used)}{limit ? <span className="text-base font-normal text-muted"> / {unit(limit)}</span> : null}
      </div>
      {pct !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-page" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)} aria-label={title}>
          <div className={`h-full rounded-full ${BAR[level]}`} style={{ width: `${Math.min(pct, 100)}%` }} />
        </div>
      )}
      <p className="text-xs text-muted">{pct !== null ? `ใช้ไป ${pct}% · เหลือ ${unit(Math.max(0, (limit ?? 0) - used))}` : "ไม่มีเพดาน"}{detail ? ` · ${detail}` : ""}</p>
      {note && <p className="text-xs text-warn">{note}</p>}
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl bg-page px-3 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-muted">{sub}</div>}
    </div>
  );
}

export default async function UsagePage() {
  await requireStaffPage();
  const u = await loadUsage();
  const v = u.visits;
  const peak = Math.max(1, ...u.daily.map((d) => d.visitors));
  const line = "error" in u.line ? null : u.line;
  const lineLimit = line?.limit ?? u.limits.line_messages ?? null;
  const lineProjected = line ? projectMonthEnd(line.used, u.dayOfMonth, u.daysInMonth) : 0;
  const b = u.biz;
  const conversion = b.quotes ? Math.round((b.paid_bookings / b.quotes) * 100) : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ภาพรวมการใช้งาน</h1>
        <p className="text-sm text-muted">ข้อมูล ณ วันที่ {u.today} · เดือนนี้ผ่านไป {u.dayOfMonth}/{u.daysInMonth} วัน</p>
      </div>

      <Panel title="โควตาบริการ (เดือนนี้)">
        <div className="grid gap-5 md:grid-cols-3">
          {line ? (
            <Meter
              title="LINE OA ข้อความ (push)"
              used={line.used}
              limit={lineLimit}
              unit={(x) => `${n(x)}`}
              detail={`คาดว่าสิ้นเดือน ~${n(lineProjected)}`}
              note={lineLimit && lineProjected > lineLimit ? "อัตรานี้จะเกินโควตาก่อนสิ้นเดือน — พิจารณาอัปเกรดแพ็กเกจ OA" : undefined}
            />
          ) : (
            <div className="space-y-1">
              <span className="font-medium">LINE OA ข้อความ (push)</span>
              <p className="text-sm text-warn">{"error" in u.line ? u.line.error : ""}</p>
            </div>
          )}
          <Meter title="ฐานข้อมูล Supabase" used={u.sizes.db} limit={u.limits.db_mb ? u.limits.db_mb * 1024 * 1024 : null} unit={fmtMb} />
          <Meter title="ไฟล์ (เอกสาร สลิป รูป)" used={u.sizes.storage} limit={u.limits.storage_mb ? u.limits.storage_mb * 1024 * 1024 : null}
            unit={fmtMb} detail={`${n(u.sizes.files)} ไฟล์`} />
        </div>
        <p className="mt-4 text-xs text-muted">
          LINE: โควตาจริงจาก LINE (อัปเดตทุก 5 นาที) · ข้อความตอบกลับ (reply) ไม่นับ · เพดานฐานข้อมูล/ไฟล์แก้ได้ที่{" "}
          <Link href="/admin/settings" className="underline">ตั้งค่า → plan_limits</Link> หลังอัปเกรดแพ็กเกจ
          {u.limits.note ? ` · ${u.limits.note}` : ""}
        </p>
      </Panel>

      <Panel title="ผู้เข้าชมเว็บ (หน้าลูกค้า)">
        <div className="grid grid-cols-3 gap-2">
          <Stat label="วันนี้" value={n(v.today_visitors)} sub={`${n(v.today_views)} ครั้งที่เปิดหน้า`} />
          <Stat label="7 วัน" value={n(v.week_visitors)} sub={`${n(v.week_views)} ครั้งที่เปิดหน้า`} />
          <Stat label="30 วัน" value={n(v.month_visitors)} sub={`${n(v.month_views)} ครั้งที่เปิดหน้า`} />
        </div>

        <figure className="mt-4">
          <figcaption className="mb-2 text-sm font-medium">ผู้เข้าชมต่อวัน (30 วันล่าสุด)</figcaption>
          <div className="relative">
            <div className="pointer-events-none absolute inset-x-0 top-0 border-t border-dashed border-line" aria-hidden="true" />
            <span className="absolute -top-2 right-0 bg-card pl-1 text-[0.65rem] text-muted" aria-hidden="true">{n(peak)}</span>
            <div className="flex h-36 items-end gap-[2px] pt-3" role="img" aria-label="กราฟผู้เข้าชมต่อวัน ดูตัวเลขในตารางด้านล่าง">
              {u.daily.map((d) => (
                <div key={d.day} className="group relative flex h-full flex-1 items-end">
                  <div className="w-full rounded-t-[4px] bg-navy transition-opacity group-hover:opacity-80"
                    style={{ height: d.visitors ? `${Math.max(3, (d.visitors / peak) * 100)}%` : "2px", opacity: d.visitors ? undefined : 0.25 }} />
                  <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs text-white shadow group-hover:block">
                    {d.day.slice(5)} · {n(d.visitors)} คน · {n(d.views)} ครั้ง
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-1 flex justify-between text-[0.65rem] text-muted">
            <span>{u.daily[0]?.day.slice(5)}</span><span>{u.daily.at(-1)?.day.slice(5)}</span>
          </div>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer text-muted">ดูเป็นตาราง</summary>
            <table className="mt-2 w-full text-left">
              <thead className="text-muted"><tr><th className="py-1 font-medium">วันที่</th><th className="py-1 text-right font-medium">ผู้เข้าชม</th><th className="py-1 text-right font-medium">เปิดหน้า</th></tr></thead>
              <tbody className="divide-y divide-line">
                {u.daily.slice().reverse().map((d) => (
                  <tr key={d.day}><td className="py-1">{d.day}</td><td className="py-1 text-right">{n(d.visitors)}</td><td className="py-1 text-right">{n(d.views)}</td></tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <h3 className="mb-2 text-sm font-medium">หน้าที่เปิดมากที่สุด (30 วัน)</h3>
            {u.pages.length === 0 ? <p className="text-sm text-muted">ยังไม่มีข้อมูล</p> : (
              <ul className="space-y-1 text-sm">
                {u.pages.map((p) => (
                  <li key={p.path} className="flex justify-between gap-2"><code className="truncate text-xs">{p.path}</code><span className="shrink-0">{n(p.views)}</span></li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">มาจากไหน (30 วัน)</h3>
            {u.refs.length === 0 ? <p className="text-sm text-muted">ยังไม่มีข้อมูล</p> : (
              <ul className="space-y-1 text-sm">
                {u.refs.map((r) => <li key={r.source} className="flex justify-between gap-2"><span className="truncate">{r.source}</span><span className="shrink-0">{n(r.visitors)} คน</span></li>)}
              </ul>
            )}
          </div>
          <div>
            <h3 className="mb-2 text-sm font-medium">ภาษาที่ใช้ (30 วัน)</h3>
            {u.langs.length === 0 ? <p className="text-sm text-muted">ยังไม่มีข้อมูล</p> : (
              <ul className="space-y-1 text-sm">
                {u.langs.map((l) => <li key={l.locale} className="flex justify-between gap-2"><span>{LANG[l.locale] ?? l.locale}</span><span>{n(l.visitors)} คน</span></li>)}
              </ul>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted">นับแบบไม่ระบุตัวตน: ไม่ใช้คุกกี้ ไม่เก็บ IP · คนเดียวกันนับซ้ำได้ถ้ากลับมาคนละวัน · ไม่นับหลังบ้าน หน้าคนขับ และบอต</p>
      </Panel>

      <Panel title="ธุรกิจเดือนนี้">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          <Stat label="ใบเสนอราคา" value={n(b.quotes)} />
          <Stat label="จองแล้วจ่ายมัดจำ" value={n(b.paid_bookings)} sub={conversion !== null ? `${conversion}% ของใบเสนอราคา` : undefined} />
          <Stat label="รับเงินแล้ว" value={formatBaht(b.received)} sub={b.refunded ? `คืนเงิน ${formatBaht(b.refunded)}` : undefined} />
          <Stat label="งานจบแล้ว" value={n(b.completed)} />
          <Stat label="ยกเลิก" value={n(b.cancelled)} />
          <Stat label="งานที่จะถึง" value={n(b.upcoming)} />
          <Stat label="ลูกค้าใหม่" value={n(b.new_customers)} sub={`ทั้งหมด ${n(b.customers)} คน`} />
          <Stat label="รอคนขับรับงาน" value={n(b.waiting_driver)} />
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="คนขับ">
          <div className="grid grid-cols-2 gap-2">
            <Stat label="พร้อมรับงาน" value={n(u.drivers.ready)} sub={`จากทั้งหมด ${n(u.drivers.total)} คน`} />
            <Stat label="เอกสารยังไม่ครบ" value={n(u.drivers.not_ready)} />
            <Stat label="เอกสารรอตรวจ" value={n(u.drivers.docs_pending)} />
            <Stat label="เอกสารหมดใน 30 วัน" value={n(u.drivers.docs_expiring)} />
          </div>
          <Link href="/admin/documents" className="mt-3 inline-block text-sm text-navy underline">ไปที่ตรวจเอกสาร</Link>
        </Panel>
        <Panel title="ข้อความ LINE ของระบบ (เดือนนี้)">
          <div className="grid grid-cols-3 gap-2">
            <Stat label="ส่งแล้ว" value={n(u.outbox.sent)} />
            <Stat label="รอส่ง" value={n(u.outbox.waiting)} />
            <Stat label="ส่งไม่ได้" value={n(u.outbox.dead)} />
          </div>
          {u.outbox.waiting > 0 && <p className="mt-2 text-xs text-warn">มีข้อความรอส่ง — ถ้ายังไม่ได้ตั้งงานอัตโนมัติ (cron) ข้อความจะไม่ถูกส่ง</p>}
          <Link href="/admin/system" className="mt-3 inline-block text-sm text-navy underline">ไปที่หน้าระบบ</Link>
        </Panel>
      </div>
    </div>
  );
}
