import Link from "next/link";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
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
    <DriverShell title={user.displayName ?? "คนขับ"} subtitle="งานของฉัน" active="home">
      {pending.map((o) => (
        <Panel key={o.id} className="ring-2 ring-amber">
          <div className="flex items-center justify-between">
            <span className="font-bold">งานใหม่!</span>
            <Badge tone="warn">ตอบภายใน {formatBangkok(o.expires_at)}</Badge>
          </div>
          <dl className="mt-2 space-y-1 text-sm">
            <div className="flex justify-between gap-3"><dt className="text-muted">วันเวลา</dt><dd className="font-medium">{formatBangkok(o.pickup_at)}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">บริการ</dt><dd>{svc(o.service_type)} · {carLabel(o.car_type)}{o.plate && ` (${o.plate})`}</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">รับ</dt><dd className="text-right">{o.origin?.name}</dd></div>
            {o.destination && <div className="flex justify-between gap-3"><dt className="text-muted">ส่ง</dt><dd className="text-right">{o.destination.name}</dd></div>}
            <div className="flex justify-between gap-3"><dt className="text-muted">ผู้โดยสาร</dt><dd>{o.pax} คน · {o.luggage} กระเป๋า</dd></div>
            <div className="flex justify-between gap-3"><dt className="text-muted">ค่างานโดยประมาณ</dt>
              <dd className="font-bold">{formatBaht(Math.round(o.price_satang * (1 - Number(commission ?? 0.2))))}</dd></div>
          </dl>
          <p className="mb-3 text-xs text-muted">ก่อนหัก ณ ที่จ่าย · ไม่รวมทางด่วน/ค่าจอด (เบิกตามจริง)</p>
          <OfferActions offerId={o.id} />
        </Panel>
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

      <Panel title="งานที่รับแล้ว">
        {jobs.length === 0 ? <Empty>ยังไม่มีงาน</Empty> : (
          <ul className="divide-y divide-line">
            {jobs.map((j) => (
              <li key={j.id}>
                <Link href={`/liff/driver/jobs/${j.id}`} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{formatBangkok(j.pickup_at)}</div>
                    <div className="text-sm text-muted">{svc(j.service_type)} · {carLabel(j.car_type)}</div>
                  </div>
                  <Badge tone={BOOKING_STATUS_TH[j.status]?.[1]}>{BOOKING_STATUS_TH[j.status]?.[0]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

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
      <p className="text-center text-sm text-muted">คะแนน {status.driver?.score ?? "—"}</p>
    </DriverShell>
  );
}
