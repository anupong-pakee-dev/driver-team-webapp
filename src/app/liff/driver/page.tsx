import Link from "next/link";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { bangkokParts, formatBangkok } from "@/lib/time";
import { carLabel, docSlots, SERVICE_TYPES } from "@/services/portal";
import { BOOKING_STATUS_TH } from "@/services/bookingView";
import { driverJobs, driverOffers } from "@/services/driverJobs";
import { Badge, Empty, Panel, btnPrimary } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "./shell";
import { driverPage } from "./session";
import { OfferActions } from "./offers";

export const dynamic = "force-dynamic";

const KYC = { pending: ["รอตรวจเอกสาร", "warn"], approved: ["อนุมัติแล้ว", "ok"], rejected: ["มีเอกสารไม่ผ่าน", "bad"] } as const;
const RESULT_TH: Record<string, [string, "ok" | "warn" | "bad" | "info"]> = {
  pending: ["รอตอบ", "warn"], accepted: ["รับแล้ว", "ok"], rejected: ["ปฏิเสธ", "bad"], expired: ["หมดเวลา", "bad"],
  withdrawn: ["เจ้าของมอบให้คนอื่น", "info"], taken: ["มีคนรับแล้ว", "info"],
};
// งานจบหรือถูกยกเลิกแล้ว แสดงสถานะงานแทนผลข้อเสนอ — ทุกคนที่เคยเห็นงานนี้รู้ว่าปิดแล้ว (ไม่ส่ง LINE)
const offerBadge = (o: { result: string; booking_status: string }): [string, "ok" | "warn" | "bad" | "info"] =>
  o.booking_status === "completed" ? ["ปิดงานแล้ว", "ok"]
  : ["cancelled", "expired", "no_show"].includes(o.booking_status) ? ["งานถูกยกเลิก", "info"]
  : RESULT_TH[o.result] ?? [o.result, "info"];

export default async function DriverHome() {
  const { user, notDriver } = await driverPage();
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;

  const [status, offers, jobs, commission] = await Promise.all([
    asUser(user.authUserId, async (db) => {
      const d = await db.query(`select kyc_status, score from drivers where user_id = $1`, [user.id]);
      const v = await db.query(`select count(*)::int as n, count(*) filter (where kyc_status = 'approved')::int as ok from vehicles`);
      const slots = await docSlots(db, "driver", user.id);
      return { driver: d.rows[0], vehicles: v.rows[0], missing: slots.filter((s) => s.required && !s.approved).length };
    }),
    driverOffers(user),
    driverJobs(user),
    getSetting<number>("commission_rate"),
  ]);
  const kyc = KYC[(status.driver?.kyc_status ?? "pending") as keyof typeof KYC];
  const ready = status.driver?.kyc_status === "approved" && status.vehicles.ok > 0;
  const pending = offers.filter((o) => o.result === "pending" && new Date(o.expires_at) > new Date());
  const history = offers.filter((o) => !pending.includes(o));
  const svc = (s: string) => SERVICE_TYPES.find((x) => x.value === s)?.label ?? s;

  return (
    <DriverShell
      title={user.displayName ?? "คนขับ"}
      subtitle="งานของฉัน"
      active="home"
      columns={2}
      extra={ready && (
        <span className="flex items-center gap-1.5 rounded-full bg-sage-soft py-1.5 pl-2 pr-3 text-[0.8125rem] font-semibold text-sage">
          <span className="h-2 w-2 rounded-full bg-sage" aria-hidden="true" />พร้อมรับงาน
        </span>
      )}
    >
      {/* 2a: ข้อเสนองานใหม่เป็นการ์ดสีเข้ม — ค่างานเด่น ปุ่มรับงานกว้างกว่าปุ่มปฏิเสธ */}
      {pending.map((o) => (
        <section key={o.id} aria-label="งานใหม่" className="rounded-3xl bg-forest p-[1.125rem] text-white">
          <p className="text-[0.8125rem] font-semibold text-sand">งานใหม่ · ตอบภายใน {formatBangkok(o.expires_at)}</p>
          <div className="mt-2.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <div className="text-2xl font-bold leading-tight">{formatBangkok(o.pickup_at)}</div>
              <div className="text-[0.8125rem] text-on-dark">{svc(o.service_type)} · {carLabel(o.car_type)}{o.plate && ` (${o.plate})`}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-[0.7rem] text-on-dark">ค่างานโดยประมาณ</div>
              <div className="text-[1.625rem] font-bold leading-none text-sand">{formatBaht(Math.round(o.price_satang * (1 - Number(commission ?? 0.2))))}</div>
            </div>
          </div>
          <div className="mt-3.5 flex gap-2.5 rounded-2xl bg-white/[.07] p-3">
            <div className="flex flex-col items-center pt-1.5" aria-hidden="true">
              <span className="h-2 w-2 rounded-full border-2 border-sand" />
              {o.destination && <><span className="my-[3px] w-0.5 flex-1 bg-white/20" /><span className="h-2 w-2 rounded-full bg-sand" /></>}
            </div>
            <dl className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
              <div><dt className="sr-only">รับ</dt><dd>{o.origin?.name}</dd></div>
              {o.destination && <div><dt className="sr-only">ส่ง</dt><dd>{o.destination.name}</dd></div>}
            </dl>
            <span className="self-end whitespace-nowrap text-xs text-on-dark">{o.pax} คน · {o.luggage} กระเป๋า</span>
          </div>
          <div className="mt-3.5"><OfferActions offerId={o.id} dark /></div>
          <p className="mt-2.5 text-center text-[0.7rem] text-on-dark">ก่อนหัก ณ ที่จ่าย · ไม่รวมทางด่วน/ค่าจอด (เบิกตามจริง)</p>
        </section>
      ))}

      {!ready && (
        <Panel title="ทำให้พร้อมรับงาน">
          <ul className="space-y-2 text-sm">
            <li className="flex items-center justify-between">
              <span>เอกสารคนขับ {status.missing > 0 && <span className="text-muted">(ขาด {status.missing})</span>}</span>
              <Badge tone={kyc[1]}>{kyc[0]}</Badge>
            </li>
            <li className="flex items-center justify-between">
              <span>รถที่อนุมัติแล้ว</span>
              <Badge tone={status.vehicles.ok > 0 ? "ok" : "warn"}>{status.vehicles.ok} / {status.vehicles.n} คัน</Badge>
            </li>
          </ul>
          <Link href="/liff/driver/documents" className={`${btnPrimary} mt-4 w-full`}>ส่งเอกสาร / เพิ่มรถ</Link>
        </Panel>
      )}

      <section aria-labelledby="jobs-h" className="pt-2 lg:col-start-2 lg:row-span-6 lg:row-start-1 lg:pt-0">
        <div className="flex items-baseline justify-between px-1">
          <h2 id="jobs-h" className="text-base font-bold">งานที่รับแล้ว</h2>
          <span className="text-[0.8125rem] text-muted">คะแนน {status.driver?.score ?? "—"}</span>
        </div>
        {jobs.length === 0 ? <div className="mt-2.5"><Empty>ยังไม่มีงาน</Empty></div> : (
          <ul className="mt-2.5 space-y-2">
            {jobs.map((j) => {
              const d = bangkokParts(j.pickup_at);
              return (
                <li key={j.id}>
                  <Link href={`/liff/driver/jobs/${j.id}`} className="flex items-center gap-3 rounded-[1.125rem] border border-line bg-card px-3.5 py-3">
                    <div className="w-11 shrink-0 text-center">
                      <div className="text-lg font-bold leading-none">{d.day}</div>
                      <div className="text-[0.7rem] text-muted">{d.month}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.9375rem] font-semibold">{d.time} · {svc(j.service_type)}</div>
                      <div className="truncate text-xs text-muted">{carLabel(j.car_type)}</div>
                    </div>
                    <Badge tone={BOOKING_STATUS_TH[j.status]?.[1]}>{BOOKING_STATUS_TH[j.status]?.[0]}</Badge>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {history.length > 0 && (
        <Panel title="ประวัติข้อเสนองาน">
          <ul className="divide-y divide-line text-sm">
            {history.slice(0, 15).map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2 py-2">
                <span>{formatBangkok(o.pickup_at)} · {svc(o.service_type)}{o.is_override && " (มอบหมายโดยเจ้าของ)"}</span>
                <Badge tone={offerBadge(o)[1]}>{offerBadge(o)[0]}</Badge>
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </DriverShell>
  );
}
