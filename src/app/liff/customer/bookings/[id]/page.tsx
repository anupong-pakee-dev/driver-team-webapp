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

// 1a · ใบชา: แถบความคืบหน้า 5 ขั้น (มัดจำ → จบงาน) · สถานะที่ไม่อยู่บนเส้นทางนี้ (ยกเลิก ฯลฯ) ไม่แสดงแถบ
const STEP_OF: Record<string, number> = {
  awaiting_deposit: 0, confirmed: 1, assigned: 2, en_route: 3, arrived: 3, picked_up: 3, dropped_off: 4, completed: 4,
};
const DOT = { ok: "bg-sage text-sage", warn: "bg-[#c9973f] text-warn", bad: "bg-bad text-bad", info: "bg-ink text-ink" } as const;
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
      <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
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
    <div className="mx-auto w-full max-w-md lg:max-w-5xl lg:py-6">
      <AppHeader title={k.title} subtitle={b.quote_number} right={<LanguageSwitcher />} back="/liff/customer" backLabel={t.common.back} />
      {/* จอคอม (lg): ซ้ายรายละเอียดงาน · ขวาการ์ดชำระเงินติดอยู่ขณะเลื่อน */}
      <main className="space-y-3 px-5 py-4 pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-x-6 lg:[&>*]:col-start-1">
        <section aria-label={k.status} className="lg:col-span-2 lg:pb-2">
          <div className={`flex items-center gap-2 text-sm font-semibold ${DOT[tone].split(" ")[1]}`}>
            <span className={`h-2 w-2 rounded-full ${DOT[tone].split(" ")[0]}`} aria-hidden="true" />
            {t.bookingStatus[b.status] ?? b.status}
          </div>
          <p className="mt-1 text-[1.625rem] font-bold leading-tight lg:text-[2.25rem]">{when(b.pickup_at)}</p>
          <p className="text-sm text-muted">{service} · {carName(b.car_type)}{b.flight_no ? ` · ${b.flight_no}` : ""}</p>
          {STEP_OF[b.status] !== undefined && (
            <ol className="mt-3.5 grid grid-cols-5 gap-1 text-[0.65rem] text-muted lg:max-w-2xl lg:text-xs">
              {k.steps.map((s, i) => {
                const cur = i === STEP_OF[b.status];
                const done = i <= STEP_OF[b.status];
                return (
                  <li key={s} aria-current={cur ? "step" : undefined} className="flex flex-col gap-1.5">
                    <span className={`h-1 rounded ${done ? (b.status === "awaiting_deposit" ? "bg-[#c9973f]" : "bg-sage") : "bg-[#ddd6c7]"}`} aria-hidden="true" />
                    <span className={cur ? `font-semibold ${b.status === "awaiting_deposit" ? "text-warn" : "text-sage"}` : ""}>{s}</span>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        <Panel>
          <div className="flex gap-3">
            <div className="flex flex-col items-center pt-1.5" aria-hidden="true">
              <span className="h-2.5 w-2.5 rounded-full border-[2.5px] border-sage" />
              {b.destination && <><span className="my-1 w-0.5 flex-1 bg-[#ddd6c7]" /><span className="h-2.5 w-2.5 rounded-full bg-sage" /></>}
            </div>
            <dl className="flex flex-1 flex-col gap-3.5">
              <div><dt className="text-xs text-muted">{k.pickup}</dt><dd className="text-[0.9375rem] font-semibold">{b.origin?.name}</dd></div>
              {b.destination && <div><dt className="text-xs text-muted">{k.drop}</dt><dd className="text-[0.9375rem] font-semibold">{b.destination.name}</dd></div>}
            </dl>
          </div>
        </Panel>

        <Panel>
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">{k.price}</dt><dd className="font-bold">{formatBaht(b.price_satang)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">{k.paid}</dt><dd>{formatBaht(b.paid_satang)}</dd></div>
            {b.due_satang > 0 && !["awaiting_deposit", "cancelled", "expired"].includes(b.status) && (
              <div className="flex justify-between gap-3"><dt className="text-muted">{k.due}</dt>
                <dd>{formatBaht(b.due_satang)} <span className="text-xs text-muted">({b.balance_due === "before_start" ? k.payBefore : k.payAfter})</span></dd></div>
            )}
          </dl>
          <Link href={`/liff/customer/quotes/${b.quote_id}`} className="mt-2 inline-block text-sm text-sage underline">{k.viewQuote(b.quote_number)}</Link>
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
          <Panel className="border-2 border-sage lg:sticky lg:top-6 lg:col-start-2! lg:row-span-12 lg:row-start-2 lg:mt-0!" title={k.payTitle(t.paymentKind[open.kind] ?? open.kind, formatBaht(open.amount_satang))}>
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
