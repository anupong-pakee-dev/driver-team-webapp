import Link from "next/link";
import { notFound } from "next/navigation";
import { promptPaySvg } from "@/adapters/payments";
import { currentUser } from "@/lib/auth";
import { asUser, pool } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev";
import { formatBaht } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { BOOKING_STATUS_TH, loadBooking, PAYMENT_KIND_TH, SLIP_REASON_TH } from "@/services/bookingView";
import { LiffLogin } from "@/components/LiffLogin";
import { AppHeader, Badge, Panel } from "@/components/ui";
import { CancelBooking, OpenBalance, SlipUpload } from "./actions";
import { Complain, CompleteTrip } from "./trip";

export const dynamic = "force-dynamic";

// FR-BOOK-04 งานของลูกค้า · FR-PAY-01/04 ชำระ · FR-PAY-06 ใบเสร็จ · FR-BOOK-06 ยกเลิก
export default async function CustomerBooking({ params }: PageProps<"/liff/customer/bookings/[id]">) {
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md">
        <AppHeader title="การจอง" subtitle="เข้าสู่ระบบด้วย LINE" />
        <main className="px-5"><LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} /></main>
      </div>
    );
  }
  const { id } = await params;
  const b = await asUser(user.authUserId, (db) => loadBooking(db, id));
  if (!b) notFound();
  const company = (await getSetting<{ promptpay_id: string; account_name: string; accounts: string[] }>("company"))!;
  const st = BOOKING_STATUS_TH[b.status] ?? [b.status, "info"];
  const open = b.payments.find((p) => ["pending", "pending_approval"].includes(p.status) && p.kind !== "refund");
  const qrSvg = open && open.method === "slip" ? await promptPaySvg(company.promptpay_id, open.amount_satang) : null;
  const qrImg = open && open.method === "gateway" ? (open.raw?.qr_image_url as string | undefined) : undefined;
  const receipts = b.payments.filter((p) => p.receipt_id);
  const refunds = b.payments.filter((p) => p.kind === "refund");
  const cancellable = ["awaiting_deposit", "confirmed", "assigned"].includes(b.status);
  const service = SERVICE_TYPES.find((s) => s.value === b.service_type)?.label;
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
      <AppHeader title="การจองของฉัน" subtitle={`${service} · ${carLabel(b.car_type)}`} />
      <main className="space-y-4 px-5 py-4 pb-10">
        <Panel>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted">สถานะ</span>
            <Badge tone={st[1]}>{st[0]}</Badge>
          </div>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">วันเวลา</dt><dd className="text-right">{formatBangkok(b.pickup_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">รับ</dt><dd className="text-right">{b.origin?.name}</dd></div>
            {b.destination && <div className="flex justify-between gap-3"><dt className="text-muted">ส่ง</dt><dd className="text-right">{b.destination.name}</dd></div>}
            {b.flight_no && <div className="flex justify-between gap-3"><dt className="text-muted">เที่ยวบิน</dt><dd>{b.flight_no}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted">ราคา</dt><dd className="font-bold">{formatBaht(b.price_satang)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">ชำระแล้ว</dt><dd>{formatBaht(b.paid_satang)}</dd></div>
            {b.due_satang > 0 && !["awaiting_deposit", "cancelled", "expired"].includes(b.status) && (
              <div className="flex justify-between gap-3"><dt className="text-muted">คงเหลือ</dt>
                <dd>{formatBaht(b.due_satang)} <span className="text-xs text-muted">({b.balance_due === "before_start" ? "ชำระก่อนเริ่มงาน" : "ชำระหลังจบงาน"})</span></dd></div>
            )}
          </dl>
          <Link href={`/liff/customer/quotes/${b.quote_id}`} className="mt-2 inline-block text-sm text-navy underline">ดูใบเสนอราคา {b.quote_number}</Link>
        </Panel>

        {trip?.display_name && ["assigned", "en_route", "arrived", "picked_up", "dropped_off"].includes(b.status) && (
          <Panel title="คนขับ">
            <p className="font-medium">{trip.display_name}</p>
            {trip.plate && <p className="text-sm text-muted">ทะเบียน {trip.plate} · {carLabel(trip.car_type)}</p>}
            <p className="mt-2 text-xs text-muted">ติดต่อคนขับผ่านแชท LINE ของเรา</p>
          </Panel>
        )}

        {b.status === "dropped_off" && !trip?.reviewed && (
          <Panel title="ถึงที่หมายแล้ว — ให้คะแนนการเดินทาง">
            <CompleteTrip bookingId={b.id} />
          </Panel>
        )}
        {complainOpen && b.status !== "disputed" && (
          <Panel><Complain bookingId={b.id} /></Panel>
        )}

        {open && (
          <Panel title={`ชำระ${PAYMENT_KIND_TH[open.kind]} ${formatBaht(open.amount_satang)}`}>
            {open.status === "pending_approval" ? (
              <div className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">
                ได้รับสลิปแล้ว — {SLIP_REASON_TH[open.reason ?? ""] ?? "รอเจ้าหน้าที่ตรวจ"}
                <span className="mt-1 block text-xs">หากโอนถูกต้องแล้ว ไม่ต้องโอนซ้ำ ทีมงานจะยืนยันให้</span>
              </div>
            ) : (
              <p className="text-sm text-muted">สแกนจ่ายด้วยแอปธนาคาร ภายใน {open.expires_at ? formatBangkok(open.expires_at) : "—"}</p>
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
                <p className="mt-2 text-center text-xs text-muted">พร้อมเพย์ {company.account_name} · ยอด {formatBaht(open.amount_satang)}</p>
                <SlipUpload paymentId={open.id} dev={devLoginEnabled()} amount={open.amount_satang} receiver={company.accounts[0] ?? ""} />
              </>
            )}
            {open.method === "gateway" && <p className="mt-2 text-center text-xs text-muted">ระบบยืนยันอัตโนมัติหลังชำระ — รีเฟรชหน้านี้</p>}
          </Panel>
        )}

        {!open && b.due_satang > 0 && ["confirmed", "assigned", "en_route", "arrived", "picked_up", "dropped_off", "completed"].includes(b.status) && (
          <Panel title="ยอดคงเหลือ">
            <OpenBalance bookingId={b.id} amount={b.due_satang} />
          </Panel>
        )}

        {receipts.length > 0 && (
          <Panel title="ใบเสร็จ">
            <ul className="divide-y divide-line text-sm">
              {receipts.map((p) => (
                <li key={p.id}>
                  <Link href={`/liff/customer/receipts/${p.receipt_id}`} className="flex justify-between py-2">
                    <span>{p.receipt_number} · {PAYMENT_KIND_TH[p.kind]}</span>
                    <span className="font-medium">{formatBaht(p.amount_satang)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>
        )}

        {b.status === "cancelled" && (
          <Panel title="ยกเลิกแล้ว">
            <p className="text-sm text-muted">{b.cancelled_at && formatBangkok(b.cancelled_at)} · {b.cancel_reason}</p>
            {refunds.map((r) => (
              <p key={r.id} className="mt-2 text-sm">
                ยอดคืน {formatBaht(r.amount_satang)} · <Badge tone={r.status === "refunded" ? "ok" : "warn"}>{r.status === "refunded" ? "โอนคืนแล้ว" : "รอโอนคืน"}</Badge>
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
