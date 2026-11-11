import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { BOOKING_STATUS_TH, PAYMENT_KIND_TH, SLIP_REASON_TH } from "@/services/bookingView";
import { Empty, StatusDot } from "@/components/ui";

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
      <h1 className="text-[1.75rem] font-bold">การจอง / การเงิน</h1>

      {/* 2a: สลิปรอตรวจ / ต้องโอนคืน เป็นแถบเตือนสีทราย แต่ละรายการกดไปจัดการได้ทันที */}
      {pending.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl bg-[#f6ecd9] px-4 py-3 text-sm text-[#7a5718]">
          <b>สลิปรอตรวจ</b>
          <span>{p.customer} · {PAYMENT_KIND_TH[p.kind]} {formatBaht(p.amount_satang)} · {SLIP_REASON_TH[p.reason ?? ""] ?? p.reason}</span>
          <Link href={`/admin/bookings/${p.booking_id}`} className="ml-auto rounded-xl bg-forest px-3.5 py-2 text-[0.8125rem] font-bold text-white">ตรวจสลิป</Link>
        </div>
      ))}
      {refunds.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center gap-x-3.5 gap-y-2 rounded-2xl bg-[#f6ecd9] px-4 py-3 text-sm text-[#7a5718]">
          <b>ต้องโอนคืน</b>
          <span>{r.customer} · {r.reason} · {formatBaht(r.amount_satang)}</span>
          <Link href={`/admin/bookings/${r.booking_id}`} className="ml-auto rounded-xl bg-forest px-3.5 py-2 text-[0.8125rem] font-bold text-white">โอนคืน</Link>
        </div>
      ))}

      <nav aria-label="กรองการจอง" className="inline-flex flex-wrap gap-1 rounded-[0.875rem] bg-chip p-1 text-sm">
        {FILTERS.map(([k, l]) => (
          <Link key={k} href={`/admin/bookings?f=${k}`} aria-current={f === k ? "page" : undefined}
            className={"rounded-[0.6875rem] px-3.5 py-2 " + (f === k ? "bg-card font-semibold shadow-[0_1px_3px_rgba(40,30,10,.1)]" : "text-muted")}>{l}</Link>
        ))}
      </nav>
      <section className="overflow-hidden rounded-[1.25rem] border border-line bg-card">
        {bookings.length === 0 ? <div className="p-4"><Empty>ไม่มีงาน</Empty></div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-[#eee8dc] text-xs text-muted">
                <tr>
                  <th className="px-5 py-3 font-medium">วันเดินทาง</th>
                  <th className="py-3 pr-3 font-medium">ลูกค้า</th>
                  <th className="py-3 pr-3 font-medium">บริการ</th>
                  <th className="py-3 pr-3 text-right font-medium">ราคา / ชำระแล้ว</th>
                  <th className="py-3 pr-5 text-right font-medium">สถานะ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0ebe1]">
                {bookings.map((b) => {
                  const st = BOOKING_STATUS_TH[b.status] ?? [b.status, "info"];
                  const pct = b.price_satang > 0 ? Math.min(100, Math.round((b.paid / b.price_satang) * 100)) : 0;
                  return (
                    <tr key={b.id} className="hover:bg-page">
                      <td className="px-5 py-3.5">
                        <Link href={`/admin/bookings/${b.id}`} className="font-semibold hover:underline">{formatBangkok(b.pickup_at)}</Link>
                        <div className="font-mono text-[0.7rem] text-muted">{b.number}</div>
                      </td>
                      <td className="py-3.5 pr-3">{b.customer}</td>
                      <td className="py-3.5 pr-3 text-muted">{SERVICE_TYPES.find((s) => s.value === b.service_type)?.label} · {carLabel(b.car_type)}</td>
                      <td className="py-3.5 pr-3 text-right">
                        <div className="font-semibold">{formatBaht(b.price_satang)}</div>
                        <div className="ml-auto mt-1 h-1 w-[90px] overflow-hidden rounded bg-chip" role="img" aria-label={`ชำระแล้ว ${formatBaht(b.paid)}`}>
                          <div className="h-1 bg-sage" style={{ width: `${pct}%` }} />
                        </div>
                        <div className="mt-0.5 text-[0.7rem] text-muted">{formatBaht(b.paid)}</div>
                      </td>
                      <td className="py-3.5 pr-5 text-right"><StatusDot tone={st[1]}>{st[0]}</StatusDot></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
