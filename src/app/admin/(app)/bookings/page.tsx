import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { BOOKING_STATUS_TH, PAYMENT_KIND_TH, SLIP_REASON_TH } from "@/services/bookingView";
import { Badge, Empty, Panel } from "@/components/ui";

const FILTERS = [
  ["active", "กำลังดำเนินการ"], ["awaiting_deposit", "รอมัดจำ"], ["closed", "ปิดแล้ว"], ["all", "ทั้งหมด"],
] as const;

export default async function BookingsPage({ searchParams }: PageProps<"/admin/bookings">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const f = String((await searchParams).f ?? "active");
  const where =
    f === "awaiting_deposit" ? `b.status = 'awaiting_deposit'`
    : f === "closed" ? `b.status in ('completed','cancelled','no_show','expired')`
    : f === "all" ? "true"
    : `b.status in ('awaiting_deposit','confirmed','assigned','en_route','arrived','picked_up','dropped_off','disputed')`;

  const { bookings, pending, refunds } = await asUser(user.authUserId, async (db) => ({
    bookings: (await db.query(
      `select b.id, b.status, b.service_type, b.car_type, b.pickup_at, b.price_satang::int, u.display_name as customer, q.number,
              coalesce((select sum(amount_satang) from payments p where p.booking_id = b.id and p.status = 'verified' and p.kind <> 'refund'), 0)::int as paid
         from bookings b join users u on u.id = b.customer_id join quotes q on q.id = b.quote_id
        where ${where} order by b.pickup_at limit 300`,
    )).rows,
    // FR-PAY-03 สลิปรอตรวจ / FR-PAY-05 รอโอนคืน
    pending: (await db.query(
      `select p.id, p.booking_id, p.kind, p.amount_satang::int, p.reason, p.created_at, u.display_name as customer
         from payments p join bookings b on b.id = p.booking_id join users u on u.id = b.customer_id
        where p.status = 'pending_approval' order by p.created_at`,
    )).rows,
    refunds: (await db.query(
      `select p.id, p.booking_id, p.amount_satang::int, p.reason, p.created_at, u.display_name as customer
         from payments p join bookings b on b.id = p.booking_id join users u on u.id = b.customer_id
        where p.kind = 'refund' and p.status = 'pending' order by p.created_at`,
    )).rows,
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">การจอง / การเงิน</h1>

      {(pending.length > 0 || refunds.length > 0) && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel title={`สลิปรอตรวจ (${pending.length})`}>
            {pending.length === 0 ? <Empty>ไม่มี</Empty> : (
              <ul className="divide-y divide-line text-sm">
                {pending.map((p) => (
                  <li key={p.id}>
                    <Link href={`/admin/bookings/${p.booking_id}`} className="flex justify-between gap-2 py-2">
                      <span>{p.customer} · {PAYMENT_KIND_TH[p.kind]} {formatBaht(p.amount_satang)}</span>
                      <Badge tone="warn">{SLIP_REASON_TH[p.reason ?? ""] ?? p.reason}</Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title={`ต้องโอนคืน (${refunds.length})`}>
            {refunds.length === 0 ? <Empty>ไม่มี</Empty> : (
              <ul className="divide-y divide-line text-sm">
                {refunds.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/bookings/${r.booking_id}`} className="flex justify-between gap-2 py-2">
                      <span>{r.customer} · {r.reason}</span><b>{formatBaht(r.amount_satang)}</b>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      )}

      <nav className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/bookings?f=${k}`}
            className={"rounded-full px-3 py-1.5 " + (f === k ? "bg-navy text-white" : "border border-line bg-card")}>{l}</Link>
        ))}
      </nav>
      <Panel>
        {bookings.length === 0 ? <Empty>ไม่มีงาน</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">วันเดินทาง</th>
                  <th className="py-2 pr-3 font-medium">ลูกค้า</th>
                  <th className="py-2 pr-3 font-medium">บริการ</th>
                  <th className="py-2 pr-3 text-right font-medium">ราคา / ชำระแล้ว</th>
                  <th className="py-2 font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {bookings.map((b) => {
                  const st = BOOKING_STATUS_TH[b.status] ?? [b.status, "info"];
                  return (
                    <tr key={b.id}>
                      <td className="py-2.5 pr-3">
                        <Link href={`/admin/bookings/${b.id}`} className="font-medium text-navy hover:underline">{formatBangkok(b.pickup_at)}</Link>
                        <div className="text-xs text-muted">{b.number}</div>
                      </td>
                      <td className="py-2.5 pr-3">{b.customer}</td>
                      <td className="py-2.5 pr-3">{SERVICE_TYPES.find((s) => s.value === b.service_type)?.label} · {carLabel(b.car_type)}</td>
                      <td className="py-2.5 pr-3 text-right">{formatBaht(b.price_satang)}<div className="text-xs text-muted">{formatBaht(b.paid)}</div></td>
                      <td className="py-2.5"><Badge tone={st[1]}>{st[0]}</Badge></td>
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
