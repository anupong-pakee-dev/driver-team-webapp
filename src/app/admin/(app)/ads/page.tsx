import { headers } from "next/headers";
import QRCode from "qrcode";
import { LANDING_CHECKS, LANDING_CHECK_TH } from "@/domain/landing";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { adReport } from "@/services/ads";
import { bangkokToday } from "@/services/compliance";
import { SERVICE_TYPES } from "@/services/portal";
import { Badge, Empty, Panel, btnSecondary, input } from "@/components/ui";
import { CampaignForm, LandingPublish, SpendForm } from "./forms";

// FR-ADS-02/04/05(ขั้นต้น)/17
export default async function AdsPage({ searchParams }: PageProps<"/admin/ads">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const sp = await searchParams;
  const today = bangkokToday();
  const from = typeof sp.from === "string" ? sp.from : `${today.slice(0, 8)}01`;
  const to = typeof sp.to === "string" ? sp.to : today;
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  const { campaigns, report } = await asUser(user.authUserId, async (db) => ({
    campaigns: (await db.query(`select * from campaigns order by created_at desc`)).rows,
    report: await adReport(db, from, to),
  }));
  const qrs = await Promise.all(campaigns.map((c) => QRCode.toString(`${origin}/go/${c.slug}`, { type: "svg", margin: 1 })));
  const published = (await getSetting<Record<string, unknown>>("landing_published")) ?? {};
  const lineOa = await getSetting<string>("line_oa_url");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">แคมเปญ / แอด</h1>

      <Panel title={`รายงานแอด ${from} – ${to}`}>
        <form className="mb-3 flex flex-wrap items-end gap-2">
          <input type="date" name="from" defaultValue={from} className={`${input} w-auto py-2`} />
          <input type="date" name="to" defaultValue={to} className={`${input} w-auto py-2`} />
          <button className={btnSecondary}>ดู</button>
        </form>
        {report.length === 0 ? <Empty>ยังไม่มีข้อมูลในช่วงนี้</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 text-left font-medium">แคมเปญ</th><th className="pr-3 font-medium">ค่าแอด</th><th className="pr-3 font-medium">คลิก</th>
                  <th className="pr-3 font-medium">ใบเสนอราคา</th><th className="pr-3 font-medium">จอง</th><th className="pr-3 font-medium">จบงาน</th>
                  <th className="pr-3 font-medium">รายได้</th><th className="pr-3 font-medium">ต้นทุน/งานจบ</th><th className="font-medium">% ของราคา</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {report.map((r, i) => (
                  <tr key={i}>
                    <td className="py-2 pr-3 text-left">{r.campaign ?? "(ไม่มีแคมเปญ)"} <span className="text-xs text-muted">{r.platform}</span></td>
                    <td className="pr-3">{formatBaht(r.spend)}</td><td className="pr-3">{r.clicks}</td><td className="pr-3">{r.quotes}</td>
                    <td className="pr-3">{r.booked}</td><td className="pr-3">{r.completed}</td><td className="pr-3">{formatBaht(r.revenue)}</td>
                    <td className="pr-3">{r.cost_per_completed !== null ? formatBaht(r.cost_per_completed) : "—"}</td>
                    <td className={r.pct_of_revenue !== null && r.pct_of_revenue > 0.15 ? "font-bold text-bad" : ""}>
                      {r.pct_of_revenue !== null ? `${(r.pct_of_revenue * 100).toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-muted">เกณฑ์ตัดช่องทาง: ต้นทุนต่องานจบ &gt; 15% ของราคางาน (ตัวแดง) · ส่งผลกลับ Meta/Google (FR-ADS-07/08) เป็นงานเฟส 2</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title="สร้างแคมเปญ / ลิงก์">
          <CampaignForm />
          {!lineOa && <p className="mt-2 text-xs text-warn">ยังไม่ได้ตั้ง line_oa_url — แคมเปญปลายทาง LINE OA จะพาไปหน้า landing แทน</p>}
        </Panel>
        <Panel title="บันทึกค่าแอด (ต่อวัน)">
          <SpendForm campaigns={campaigns.map((c) => ({ id: c.id, name: c.name, platform: c.platform }))} today={today} />
        </Panel>
      </div>

      <Panel title={`แคมเปญ (${campaigns.length})`}>
        {campaigns.length === 0 ? <Empty>ยังไม่มีแคมเปญ</Empty> : (
          <ul className="divide-y divide-line">
            {campaigns.map((c, i) => (
              <li key={c.id} className="flex flex-wrap items-start gap-4 py-3 text-sm">
                <div className="h-24 w-24 shrink-0 rounded-lg border border-line bg-white p-1" dangerouslySetInnerHTML={{ __html: qrs[i] }} />
                <div className="min-w-60 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <b>{c.name}</b><Badge>{c.platform}</Badge>
                    <Badge tone={c.status === "active" ? "ok" : "warn"}>{c.status}</Badge>
                    <span className="text-xs text-muted">→ {c.target === "line_oa" ? "LINE OA" : `landing ${c.service_type ?? "airport_transfer"}`}</span>
                  </div>
                  <code className="block break-all rounded bg-page px-2 py-1 text-xs">{origin}/go/{c.slug}</code>
                  <div className="text-xs text-muted">utm: {[c.utm_source, c.utm_medium, c.utm_campaign].filter(Boolean).join(" / ") || "—"} · {c.start_at ?? "…"} – {c.end_at ?? "…"}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="หน้า landing (FR-ADS-14/17)">
        <ul className="space-y-3">
          {SERVICE_TYPES.filter((s) => s.value !== "driver_only").map((s) => (
            <li key={s.value} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span><b>{s.label}</b> <code className="text-xs text-muted">/l/{s.value}</code></span>
              {published[s.value] ? <Badge tone="ok">เผยแพร่แล้ว</Badge> : <Badge tone="warn">ยังไม่เผยแพร่</Badge>}
              {user.role === "owner" && (
                <LandingPublish service={s.value} published={!!published[s.value]}
                  checks={LANDING_CHECKS.map((k) => ({ key: k, label: LANDING_CHECK_TH[k] }))} />
              )}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
