import { notFound } from "next/navigation";
import { TRIP_STEPS } from "@/domain/dispatch";
import { formatBaht } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { BOOKING_STATUS_TH } from "@/services/bookingView";
import { driverJob } from "@/services/driverJobs";
import { Badge, Panel } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "../../shell";
import { driverPage } from "../../session";
import { ContactButton, DriverCancel, IncidentForm, TripStepButton } from "./actions";

export const dynamic = "force-dynamic";

const NEXT_STEP: Record<string, keyof typeof TRIP_STEPS> = { assigned: "depart", en_route: "arrive", arrived: "pickup", picked_up: "dropoff" };

// FR-TRIP-01..06 หน้าวันงานของคนขับ
export default async function DriverJob({ params }: PageProps<"/liff/driver/jobs/[id]">) {
  const { user, notDriver } = await driverPage();
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;
  const j = await driverJob(user, (await params).id);
  if (!j) notFound();
  const emergency = (await getSetting<{ owner_phone: string; numbers: { label: string; phone: string }[] }>("emergency"))!;
  const st = BOOKING_STATUS_TH[j.status] ?? [j.status, "info"];
  const step = NEXT_STEP[j.status];
  const unpaid = j.balance_due === "before_start" && j.paid < j.price_satang;
  const maps = (p: { lat?: number; lng?: number; name: string }) =>
    p.lat != null ? `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}` : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`;

  return (
    <DriverShell title={formatBangkok(j.pickup_at)} subtitle={`${SERVICE_TYPES.find((s) => s.value === j.service_type)?.label} · ${carLabel(j.car_type)}${j.plate ? ` · ${j.plate}` : ""}`} active="home">
      <Panel>
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted">สถานะ</span>
          <Badge tone={st[1]}>{st[0]}</Badge>
        </div>
        <dl className="mt-3 space-y-2 text-sm">
          <div>
            <dt className="text-muted">รับ</dt>
            <dd className="flex items-center justify-between gap-2"><span className="font-medium">{j.origin?.name}</span>
              <a className="text-navy underline" href={maps(j.origin)} target="_blank" rel="noreferrer">นำทาง</a></dd>
          </div>
          {j.stops?.map((s: { name: string; lat?: number; lng?: number }, i: number) => (
            <div key={i}><dt className="text-muted">แวะ {i + 1}</dt><dd>{s.name}</dd></div>
          ))}
          {j.destination && (
            <div>
              <dt className="text-muted">ส่ง</dt>
              <dd className="flex items-center justify-between gap-2"><span className="font-medium">{j.destination.name}</span>
                <a className="text-navy underline" href={maps(j.destination)} target="_blank" rel="noreferrer">นำทาง</a></dd>
            </div>
          )}
          {j.flight_no && <div><dt className="text-muted">เที่ยวบิน</dt><dd>{j.flight_no} · {j.airport} {j.flight_direction === "arrival" ? "ขาเข้า (รับที่สนามบิน)" : "ขาออก"}</dd></div>}
          <div><dt className="text-muted">ผู้โดยสาร</dt><dd>{j.pax} คน · {j.luggage} กระเป๋า{j.child_seats ? ` · ที่นั่งเด็ก ${j.child_seats}` : ""}{j.hours ? ` · เหมา ${j.hours} ชม.` : ""}</dd></div>
          {j.notes && <div><dt className="text-muted">หมายเหตุ</dt><dd>{j.notes}</dd></div>}
        </dl>
        {unpaid && j.status === "assigned" && (
          <p className="mt-3 rounded-xl bg-warn/10 px-3 py-2 text-sm text-warn">ลูกค้ายังชำระยอดคงเหลือไม่ครบ ({formatBaht(j.price_satang - j.paid)}) — ทีมงานจะติดตาม</p>
        )}
      </Panel>

      {step && (
        <Panel title="ขั้นตอนถัดไป">
          <TripStepButton bookingId={j.id} step={step} needsPhoto={TRIP_STEPS[step].photo} />
        </Panel>
      )}

      <Panel title="ติดต่อลูกค้า">
        <ContactButton bookingId={j.id} />
        <p className="mt-2 text-xs text-muted">เปิดดูได้ 2 ชม. ก่อนรับถึง 2 ชม. หลังส่ง · ทุกครั้งที่เปิดถูกบันทึก · ห้ามติดต่อลูกค้านอกระบบ</p>
      </Panel>

      <Panel title="ฉุกเฉิน">
        <div className="grid grid-cols-2 gap-2">
          {emergency.numbers.map((n) => (
            <a key={n.phone} href={`tel:${n.phone}`} className="rounded-xl bg-bad/10 px-3 py-3 text-center font-bold text-bad">{n.label} {n.phone}</a>
          ))}
          {j.insurance_claim_phone && (
            <a href={`tel:${j.insurance_claim_phone}`} className="rounded-xl bg-navy/10 px-3 py-3 text-center font-bold text-navy">
              เคลมประกัน {j.voluntary_insurer ?? ""} {j.insurance_claim_phone}
            </a>
          )}
          {emergency.owner_phone && (
            <a href={`tel:${emergency.owner_phone}`} className="rounded-xl bg-navy/10 px-3 py-3 text-center font-bold text-navy">เจ้าของ {emergency.owner_phone}</a>
          )}
        </div>
      </Panel>

      {["assigned", "en_route", "arrived", "picked_up", "dropped_off"].includes(j.status) && (
        <Panel title="แจ้งเหตุการณ์">
          <IncidentForm bookingId={j.id} canNoShow={j.status === "arrived"} />
        </Panel>
      )}

      {j.status === "assigned" && (
        <Panel>
          <DriverCancel bookingId={j.id} />
        </Panel>
      )}
    </DriverShell>
  );
}
