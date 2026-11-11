import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { QUOTE_STATUS_TH } from "@/services/quoteView";
import { Badge, Empty, Panel, btnPrimary } from "@/components/ui";

const FILTERS = [
  ["open", "รอลูกค้า/รออนุมัติ"], ["pending_approval", "รออนุมัติส่วนลด"], ["all", "ทั้งหมด"],
] as const;

export default async function QuotesPage({ searchParams }: PageProps<"/admin/quotes">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const f = String((await searchParams).f ?? "open");
  const where =
    f === "pending_approval" ? `q.status = 'pending_approval'`
    : f === "all" ? `true`
    : `q.status in ('sent','pending_approval') and q.expires_at > now()`;
  const rows = await asUser(user.authUserId, async (db) => (await db.query(
    `select q.id, q.number, q.revision, q.status, q.service_type, q.car_type, q.final_satang::int, q.discount_satang::int,
            q.pickup_at, q.expires_at, q.created_at, q.distance_source, u.display_name as customer
       from quotes q join users u on u.id = q.customer_id
      where ${where}
      order by (q.status = 'pending_approval') desc, q.created_at desc limit 200`,
  )).rows);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">ใบเสนอราคา</h1>
        <Link href="/admin/quotes/new" className={btnPrimary}>+ ออกใบเสนอราคาให้ลูกค้า</Link>
      </div>
      <nav className="flex gap-2 text-sm">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/quotes?f=${k}`}
            className={"rounded-full px-3 py-1.5 " + (f === k ? "bg-navy text-white" : "border border-line bg-card")}>{l}</Link>
        ))}
      </nav>
      <Panel>
        {rows.length === 0 ? <Empty>ไม่มีใบเสนอราคา</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">เลขที่</th>
                  <th className="py-2 pr-3 font-medium">ลูกค้า</th>
                  <th className="py-2 pr-3 font-medium">บริการ</th>
                  <th className="py-2 pr-3 font-medium">วันเดินทาง</th>
                  <th className="py-2 pr-3 text-right font-medium">ราคา</th>
                  <th className="py-2 pr-3 font-medium">สถานะ</th>
                  <th className="py-2 font-medium">หมดอายุ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((q) => {
                  const st = QUOTE_STATUS_TH[q.status] ?? [q.status, "info"];
                  return (
                    <tr key={q.id}>
                      <td className="py-2.5 pr-3">
                        <Link href={`/admin/quotes/${q.id}`} className="font-medium text-sage hover:underline">
                          {q.number}{q.revision > 1 && ` r${q.revision}`}
                        </Link>
                      </td>
                      <td className="py-2.5 pr-3">{q.customer ?? "—"}</td>
                      <td className="py-2.5 pr-3">
                        {SERVICE_TYPES.find((s) => s.value === q.service_type)?.label} · {carLabel(q.car_type)}
                      </td>
                      <td className="py-2.5 pr-3">{formatBangkok(q.pickup_at)}</td>
                      <td className="py-2.5 pr-3 text-right">
                        {formatBaht(q.final_satang)}
                        {q.discount_satang > 0 && <div className="text-xs text-muted">ลด {formatBaht(q.discount_satang)}</div>}
                      </td>
                      <td className="py-2.5 pr-3"><Badge tone={st[1]}>{st[0]}</Badge></td>
                      <td className="py-2.5 text-xs text-muted">{formatBangkok(q.expires_at)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
