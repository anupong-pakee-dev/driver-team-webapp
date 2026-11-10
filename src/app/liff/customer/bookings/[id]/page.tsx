import Link from "next/link";
import { notFound } from "next/navigation";
import { promptPaySvg } from "@/adapters/payments";
import { currentUser } from "@/lib/auth";
import { asUser, pool } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev";
import { formatBaht } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { getI18n } from "@/lib/locale";
import { BOOKING_STATUS_TH, loadBooking } from "@/services/bookingView";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { LiffLogin } from "@/components/LiffLogin";
import { AppHeader, Badge, Panel } from "@/components/ui";
import { CancelBooking, OpenBalance, SlipUpload } from "./actions";
import { Complain, CompleteTrip } from "./trip";

export const dynamic = "force-dynamic";

// FR-BOOK-04 งานของลูกค้า · FR-PAY-01/04 ชำระ · FR-PAY-06 ใบเสร็จ · FR-BOOK-06 ยกเลิก
export default async function CustomerBooking({ params }: PageProps<"/liff/customer/bookings/[id]">) {
  const { t, locale } = await getI18n();
  const k = t.booking;
  const when = (d: string) => formatBangkok(d, locale);
  const carName = (c: string) => t.car[c] ?? c;
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md">
        <AppHeader title={k.loginTitle} subtitle={t.common.loginSubtitle} right={<LanguageSwitcher />} />
        <main className="px-5"><LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} /></main>
      </div>
    );
  }
  const { id } = await params;
  const b = await asUser(user.authUserId, (db) => loadBooking(db, id));
  if (!b) notFound();
  const company = (await getSetting<{ promptpay_id: string; account_name: string; accounts: string[] }>("company"))!;
  const tone = BOOKING_STATUS_TH[b.status]?.[1] ?? "info";
  const open = b.payments.find((p) => ["pending", "pending_approval"].includes(p.status) && p.kind !== "refund");
  const qrSvg = open && open.method === "slip" ? await promptPaySvg(company.promptpay_id, open.amount_satang) : null;
  const qrImg = open && open.method === "gateway" ? (open.raw?.qr_image_url as string | undefined) : undefined;
  const receipts = b.payments.filter((p) => p.receipt_id);
  const refunds = b.payments.filter((p) => p.kind === "refund");
  const cancellable = ["awaiting_deposit", "confirmed", "assigned"].includes(b.status);
  const service = t.service[b.service_type] ?? b.service_type;
  // FR-BOOK-04: ชื่อเล่นคนขับ + ทะเบียน (เมื่อ assign) — ลูกค้าอ่านตาราง users/vehicles ของคนขับตรงไม่ได้
  const { rows: drv } = await pool.query(
    `select u.display_name, v.plate, v.car_type, (select at from checkins c where c.booking_id = b.id and c.kind = 'dropoff') as dropped_at,
            exists (select 1 from reviews r where r.booking_id = b.id) as reviewed,
            coalesce((select at from checkins c where c.booking_id = b.id and c.kind = 'dropoff') > now() - interval '24 hours', false) as complain_window
       from bookings b left join users u on u.id = b.driver_id left join vehicles v on v.id = b.vehicle_id where b.id = $1`, [b.id]);
  const trip = drv[0];
  const complainOpen = ["dropped_off", "completed"].includes(b.status) && trip?.complain_window;

  return (
    <div className="mx-auto w-full max-w-md">
      <AppHeader title={k.title} subtitle={`${service} · ${carName(b.car_type)}`} right={<LanguageSwitcher />} />
      <main className="space-y-4 px-5 py-4 pb-10">
        <Panel>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">{k.status}</span>
            <Badge tone={tone}>{t.bookingStatus[b.status] ?? b.status}</Badge>
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">{k.when}</dt><dd className="text-right">{when(b.pickup_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{k.pickup}</dt><dd className="text-right">{b.origin?.name}</dd></div>
            {b.destination && <div className="flex justify-between gap-3"><dt className="text-muted">{k.drop}</dt><dd className="text-right">{b.destination.name}</dd></div>}
            {b.flight_no && <div className="flex justify-between gap-3"><dt className="text-muted">{k.flight}</dt><dd>{b.flight_no}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted">{k.price}</dt><dd className="font-bold">{formatBaht(b.price_satang)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{k.paid}</dt><dd>{formatBaht(b.paid_satang)}</dd></div>
            {b.due_satang > 0 && !["awaiting_deposit", "cancelled", "expired"].includes(b.status) && (
              <div className="flex justify-between gap-3"><dt className="text-muted">{k.due}</dt>
                <dd>{formatBaht(b.due_satang)} <span className="text-xs text-muted">({b.balance_due === "before_start" ? k.payBefore : k.payAfter})</span></dd></div>
            )}
          </dl>
          <Link href={`/liff/customer/quotes/${b.quote_id}`} className="mt-2 inline-block text-sm text-navy underline">{k.viewQuote(b.quote_number)}</Link>
        </Panel>

        {trip?.display_name && ["assigned", "en_route", "arrived", "picked_up", "dropped_off"].includes(b.status) && (
          <Panel title={k.driver}>
            <p className="font-medium">{trip.display_name}</p>
            {trip.plate && <p className="text-sm text-muted">{k.plate(trip.plate, carName(trip.car_type))}</p>}
            <p className="mt-2 text-xs text-muted">{k.contactDriver}</p>
          </Panel>
        )}

        {b.status === "dropped_off" && !trip?.reviewed && (
          <Panel title={k.rateTitle}>
            <CompleteTrip bookingId={b.id} />
          </Panel>
        )}
        {complainOpen && b.status !== "disputed" && (
          <Panel><Complain bookingId={b.id} /></Panel>
        )}

        {open && (
          <Panel title={k.payTitle(t.paymentKind[open.kind] ?? open.kind, formatBaht(open.amount_satang))}>
            {open.status === "pending_approval" ? (
              <div className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">
                {k.slipReceived(t.slipReason[open.reason ?? ""] ?? k.waitStaff)}
                <span className="mt-1 block text-xs">{k.noResend}</span>
              </div>
            ) : (
              <p className="text-sm text-muted">{k.scanPay(open.expires_at ? when(open.expires_at) : "—")}</p>
            )}
            {qrSvg && (
              <div className="mx-auto mt-3 w-56 max-w-full rounded-xl border border-line bg-white p-2"
                // SVG สร้างจาก payload ของเราเอง (ไม่ใช่ข้อมูลผู้ใช้)
                dangerouslySetInnerHTML={{ __html: qrSvg }} />
            )}
            {qrImg && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrImg} alt="QR PromptPay" className="mx-auto mt-3 w-56 rounded-xl border border-line" />
            )}
            {open.method === "slip" && (
              <>
                <p className="mt-2 text-center text-xs text-muted">{k.promptpay(company.account_name, formatBaht(open.amount_satang))}</p>
                <SlipUpload paymentId={open.id} dev={devLoginEnabled()} amount={open.amount_satang} receiver={company.accounts[0] ?? ""} />
              </>
            )}
            {open.method === "gateway" && <p className="mt-2 text-center text-xs text-muted">{k.gatewayNote}</p>}
          </Panel>
        )}

        {!open && b.due_satang > 0 && ["confirmed", "assigned", "en_route", "arrived", "picked_up", "dropped_off", "completed"].includes(b.status) && (
          <Panel title={k.balanceTitle}>
            <OpenBalance bookingId={b.id} amount={b.due_satang} />
          </Panel>
        )}

        {receipts.length > 0 && (
          <Panel title={k.receipts}>
            <ul className="divide-y divide-line text-sm">
              {receipts.map((p) => (
                <li key={p.id}>
                  <Link href={`/liff/customer/receipts/${p.receipt_id}`} className="flex justify-between py-2">
                    <span>{p.receipt_number} · {t.paymentKind[p.kind] ?? p.kind}</span>
                    <span className="font-medium">{formatBaht(p.amount_satang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {b.status === "cancelled" && (
          <Panel title={k.cancelledTitle}>
            <p className="text-sm text-muted">{b.cancelled_at && when(b.cancelled_at)} · {b.cancel_reason}</p>
            {refunds.map((r) => (
              <p key={r.id} className="mt-2 text-sm">
                {k.refund(formatBaht(r.amount_satang))} · <Badge tone={r.status === "refunded" ? "ok" : "warn"}>{r.status === "refunded" ? k.refunded : k.refundPending}</Badge>
              </p>
            ))}
          </Panel>
        )}

        {cancellable && (
          <Panel>
            <CancelBooking bookingId={b.id} />
          </Panel>
        )}
      </main>
    </div>
  );
}
