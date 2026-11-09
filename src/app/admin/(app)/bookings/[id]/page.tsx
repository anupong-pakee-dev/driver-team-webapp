import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import {
  BOOKING_STATUS_TH, loadBooking, PAYMENT_KIND_TH, PAYMENT_STATUS_TH, SLIP_REASON_TH,
} from "@/services/bookingView";
import { Badge, Panel } from "@/components/ui";
import { CompanyCancel, PaymentDecision, RefundPaid, SourceTag } from "./actions";
import { DispatchPanel } from "./dispatch";

export default async function AdminBooking({ params }: PageProps<"/admin/bookings/[id]">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const { id } = await params;
  const data = await asUser(user.authUserId, async (db) => {
    const b = await loadBooking(db, id);
    if (!b) return null;
    const { rows } = await db.query(`select display_name from users where id = $1`, [b.customer_id]);
    const campaigns = (await db.query(`select id, name, platform from campaigns order by created_at desc`)).rows;
    return { b, customer: rows[0]?.display_name as string | null, campaigns };
  });
  if (!data) notFound();
  const { b, customer } = data;
  const st = BOOKING_STATUS_TH[b.status] ?? [b.status, "info"];
  const isOwner = user.role === "owner";
  const service = SERVICE_TYPES.find((s) => s.value === b.service_type)?.label;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="space-y-4">
        <Link href="/admin/bookings" className="text-sm text-muted">← การจอง</Link>
        <Panel>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-xl font-bold">{service} · {carLabel(b.car_type)}</h1>
            <Badge tone={st[1]}>{st[0]}</Badge>
          </div>
          <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-muted">ลูกค้า</dt><dd>{customer}</dd>
            <dt className="text-muted">วันเวลา</dt><dd>{formatBangkok(b.pickup_at)} – {formatBangkok(b.est_end_at)}</dd>
            <dt className="text-muted">รับ</dt><dd>{b.origin?.name}</dd>
            {b.destination && <><dt className="text-muted">ส่ง</dt><dd>{b.destination.name}</dd></>}
            {b.flight_no && <><dt className="text-muted">เที่ยวบิน</dt><dd>{b.flight_no} ({b.airport})</dd></>}
            <dt className="text-muted">ผู้โดยสาร</dt><dd>{b.pax} คน · {b.luggage} กระเป๋า</dd>
            {b.notes && <><dt className="text-muted">หมายเหตุ</dt><dd>{b.notes}</dd></>}
            <dt className="text-muted">ใบเสนอราคา</dt>
            <dd><Link href={`/admin/quotes/${b.quote_id}`} className="text-navy underline">{b.quote_number} rev.{b.revision}</Link></dd>
            <dt className="text-muted">ราคา</dt><dd className="font-bold">{formatBaht(b.price_satang)}</dd>
            <dt className="text-muted">มัดจำ</dt><dd>{formatBaht(b.deposit_satang)}</dd>
            <dt className="text-muted">ชำระแล้ว</dt><dd>{formatBaht(b.paid_satang)} · คงเหลือ {formatBaht(b.due_satang)} ({b.balance_due === "before_start" ? "ก่อนเริ่มงาน" : "หลังจบงาน"})</dd>
          </dl>
          {b.status === "cancelled" && (
            <p className="mt-3 rounded-xl bg-bad/10 px-3 py-2 text-sm text-bad">
              ยกเลิกโดย {b.cancelled_by} · {b.cancel_reason} · กฎ {b.cancel_rule} · คืน {formatBaht(b.refund_satang ?? 0)} · ส่วนคนขับ {formatBaht(b.driver_share_satang ?? 0)}
            </p>
          )}
        </Panel>

        <Panel title="การเงิน">
          <ul className="divide-y divide-line">
            {b.payments.map((p) => {
              const ps = PAYMENT_STATUS_TH[p.status] ?? [p.status, "info"];
              return (
                <li key={p.id} className="space-y-2 py-3 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{PAYMENT_KIND_TH[p.kind]} {formatBaht(p.amount_satang)}</span>
                    <Badge tone={ps[1]}>{ps[0]}</Badge>
                    <span className="text-xs text-muted">{p.method} · {formatBangkok(p.created_at)}</span>
                    {p.receipt_number && <span className="ml-auto font-mono text-xs">{p.receipt_number}</span>}
                  </div>
                  {p.reason && p.status !== "verified" && <div className="text-xs text-warn">{SLIP_REASON_TH[p.reason] ?? p.reason}</div>}
                  {p.raw?.ref ? (
                    <div className="text-xs text-muted">
                      สลิป: ref {String(p.raw.ref)} · {formatBaht(Number(p.raw.amount_satang))} · ผู้รับ {String(p.raw.receiver)}
                    </div>
                  ) : null}
                  {p.requested_by_name && p.status === "pending_approval" && <div className="text-xs text-muted">ขออนุมัติโดย {p.requested_by_name}</div>}
                  <div className="flex flex-wrap gap-3">
                    {p.slip_file_path && <a className="text-navy underline" target="_blank" rel="noreferrer" href={`/api/admin/files?payment=${p.id}&kind=slip`}>ดูสลิป ↗</a>}
                    {p.proof_file_path && <a className="text-navy underline" target="_blank" rel="noreferrer" href={`/api/admin/files?payment=${p.id}&kind=proof`}>หลักฐานโอนคืน ↗</a>}
                  </div>
                  {["pending", "pending_approval"].includes(p.status) && p.kind !== "refund" && (
                    <PaymentDecision paymentId={p.id} isOwner={isOwner} />
                  )}
                  {p.kind === "refund" && p.status === "pending" && isOwner && <RefundPaid paymentId={p.id} />}
                </li>
              );
            })}
          </ul>
        </Panel>
      </div>

      <div className="space-y-4">
        {isOwner && ["awaiting_deposit", "confirmed", "assigned"].includes(b.status) && (
          <Panel title="ยกเลิกในนามบริษัท">
            <CompanyCancel bookingId={b.id} />
          </Panel>
        )}
        <DispatchPanel user={user} bookingId={b.id} status={b.status} />
        <Panel title="ที่มาของงาน">
          <SourceTag bookingId={b.id} platform={b.source_platform} campaignId={b.campaign_id} campaigns={data.campaigns} />
        </Panel>
      </div>
    </div>
  );
}
