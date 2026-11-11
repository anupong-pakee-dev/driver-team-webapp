import { notFound } from "next/navigation";
import { TRIP_STEPS } from "@/domain/dispatch";
import { navLinks } from "@/domain/geo";
import { formatBaht } from "@/lib/money";
import { getSetting } from "@/lib/settings";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { BOOKING_STATUS_TH } from "@/services/bookingView";
import { driverJob } from "@/services/driverJobs";
import { Badge } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "../../shell";
import { driverPage } from "../../session";
import { ContactButton, DriverCancel, IncidentForm, TripStepButton } from "./actions";

export const dynamic = "force-dynamic";

const NEXT_STEP: Record<string, keyof typeof TRIP_STEPS> = { assigned: "depart", en_route: "arrive", arrived: "pickup", picked_up: "dropoff" };
// 2a: แถบ 4 ขั้นของวันงาน — ขั้นที่ต้องกดต่อไปเป็นสีเขียว · ขั้นที่ผ่านแล้วเป็นสีเขียวจาง
const STEPS = [
  { key: "depart", label: "ออกเดินทาง" }, { key: "arrive", label: "ถึงจุดรับ" },
  { key: "pickup", label: "รับแล้ว 📷" }, { key: "dropoff", label: "ส่งแล้ว 📷" },
] as const;
const DONE_UPTO: Record<string, number> = { assigned: 0, en_route: 1, arrived: 2, picked_up: 3, dropped_off: 4, completed: 4 };
const chip = "rounded-xl bg-sage-soft px-2.5 py-2 text-xs font-semibold text-sage";

// นำทางจากพิกัดที่ลูกค้าปักไว้ — เปิดแอป Google Maps / Waze ในมือถือ (ไม่ใช้ API key) · งานย้ายจาก Pilot มีแค่ชื่อ → ค้นหาแทน
function Nav({ p }: { p: { lat?: number; lng?: number; name: string } | null }) {
  if (!p) return null;
  if (p.lat == null || p.lng == null) {
    return <a className={chip} href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(p.name)}`} target="_blank" rel="noreferrer">ค้นหา</a>;
  }
  const l = navLinks({ lat: p.lat, lng: p.lng });
  return (
    <span className="flex shrink-0 gap-1.5 self-center">
      <a className={chip} href={l.google} target="_blank" rel="noreferrer">Google Maps</a>
      <a className={chip} href={l.waze} target="_blank" rel="noreferrer">Waze</a>
    </span>
  );
}

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

  const done = DONE_UPTO[j.status] ?? -1;
  const row = "flex gap-3 border-b border-[#eee8dc] px-4 py-3.5";

  return (
    <DriverShell
      title={formatBangkok(j.pickup_at)}
      subtitle={`${SERVICE_TYPES.find((s) => s.value === j.service_type)?.label} · ${carLabel(j.car_type)}${j.plate ? ` · ${j.plate}` : ""}`}
      active="home"
      back="/liff/driver"
      extra={<Badge tone={st[1]}>{st[0]}</Badge>}
      bottom={step && <TripStepButton bookingId={j.id} step={step} needsPhoto={TRIP_STEPS[step].photo} />}
    >
      {done >= 0 && (
        <ol className="grid grid-cols-4 gap-1 px-1 text-center text-[0.7rem] text-muted" aria-label="ขั้นตอนวันงาน">
          {STEPS.map((s, i) => {
            const cur = s.key === step;
            return (
              <li key={s.key} aria-current={cur ? "step" : undefined} className="flex flex-col gap-1.5">
                <span className={`h-1 rounded ${cur ? "bg-sage" : i < done ? "bg-sage/40" : "bg-[#ddd6c7]"}`} aria-hidden="true" />
                <span className={cur ? "font-bold text-sage" : ""}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-card" aria-label="เส้นทาง">
        <div className={row}>
          <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-[2.5px] border-sage" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <div className="text-xs text-muted">รับ{j.flight_no ? ` · ${j.flight_no} ${j.flight_direction === "arrival" ? "ขาเข้า" : "ขาออก"}` : ""}</div>
            <div className="text-base font-semibold">{j.origin?.name}</div>
          </div>
          <Nav p={j.origin} />
        </div>
        {j.stops?.map((s: { name: string; lat?: number; lng?: number }, i: number) => (
          <div key={i} className={row}>
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 border-sage/60" aria-hidden="true" />
            <div className="min-w-0 flex-1"><div className="text-xs text-muted">แวะ {i + 1}</div><div className="text-[0.9375rem]">{s.name}</div></div>
            <Nav p={s} />
          </div>
        ))}
        {j.destination && (
          <div className={row}>
            <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-sage" aria-hidden="true" />
            <div className="min-w-0 flex-1"><div className="text-xs text-muted">ส่ง</div><div className="text-base font-semibold">{j.destination.name}</div></div>
            <Nav p={j.destination} />
          </div>
        )}
        <div className="space-y-1 px-4 py-3 text-[0.8125rem] text-muted">
          <p>{j.pax} คน · {j.luggage} กระเป๋า{j.child_seats ? ` · ที่นั่งเด็ก ${j.child_seats}` : ""}{j.hours ? ` · เหมา ${j.hours} ชม.` : ""}</p>
          {j.flight_no && <p>เที่ยวบิน {j.flight_no} · {j.airport} {j.flight_direction === "arrival" ? "ขาเข้า (รับที่สนามบิน)" : "ขาออก"}</p>}
          {j.notes && <p>หมายเหตุ: {j.notes}</p>}
        </div>
      </section>

      {unpaid && j.status === "assigned" && (
        <p className="rounded-2xl bg-warn/10 px-3.5 py-2.5 text-sm text-warn">ลูกค้ายังชำระยอดคงเหลือไม่ครบ ({formatBaht(j.price_satang - j.paid)}) — ทีมงานจะติดตาม</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-[1.125rem] border border-line bg-card p-3">
          <ContactButton bookingId={j.id} />
        </div>
        <section aria-label="ฉุกเฉิน" className="rounded-[1.125rem] border border-[#f0d6cf] bg-[#fbeeea] p-3 text-[#9a3a26]">
          <h2 className="text-sm font-semibold">ฉุกเฉิน</h2>
          <ul className="mt-1 space-y-0.5 text-xs font-semibold">
            {emergency.numbers.map((n) => (
              <li key={n.phone}><a href={`tel:${n.phone}`} className="block py-1 underline-offset-2 hover:underline">โทร {n.label} {n.phone}</a></li>
            ))}
            {j.insurance_claim_phone && (
              <li><a href={`tel:${j.insurance_claim_phone}`} className="block py-1 hover:underline">เคลมประกัน {j.voluntary_insurer ?? ""} {j.insurance_claim_phone}</a></li>
            )}
            {emergency.owner_phone && (
              <li><a href={`tel:${emergency.owner_phone}`} className="block py-1 hover:underline">เจ้าของ {emergency.owner_phone}</a></li>
            )}
          </ul>
        </section>
      </div>
      <p className="px-1 text-[0.7rem] text-muted">ข้อมูลลูกค้าเปิดดูได้ 2 ชม. ก่อนรับถึง 2 ชม. หลังส่ง · ทุกครั้งที่เปิดถูกบันทึก · ห้ามติดต่อลูกค้านอกระบบ</p>

      <div className="flex flex-wrap justify-between gap-x-4 gap-y-3 px-1">
        {["assigned", "en_route", "arrived", "picked_up", "dropped_off"].includes(j.status) && (
          <IncidentForm bookingId={j.id} canNoShow={j.status === "arrived"} />
        )}
        {j.status === "assigned" && <DriverCancel bookingId={j.id} />}
      </div>
    </DriverShell>
  );
}
