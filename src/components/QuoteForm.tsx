"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuoteFormOptions } from "@/services/quoteForm";
import { formatBaht } from "@/lib/money";
import { PlaceInput, type PickedPlace } from "./PlaceInput";
import { btnPrimary, btnSecondary, input } from "./ui";

const RULE_TH: Record<string, string> = {
  PAX_EXCEEDS_SEATS: "จำนวนผู้โดยสารเกินที่นั่งของรถประเภทนี้",
  LUGGAGE_EXCEEDS_CAPACITY: "จำนวนกระเป๋าเกินความจุของรถประเภทนี้",
  FLIGHT_REQUIRED: "กรุณากรอกเลขเที่ยวบิน หรือเลือก “ไม่มีเที่ยวบิน”",
  DESTINATION_REQUIRED: "กรุณาเลือกปลายทาง",
  HOURS_REQUIRED: "กรุณาเลือกจำนวนชั่วโมง",
  PICKUP_TOO_SOON: "กรุณาจองล่วงหน้าอย่างน้อย 2 ชั่วโมง",
  TOO_MANY_STOPS: "จุดแวะได้ไม่เกิน 5 จุด",
};

const SOURCES = [
  ["facebook", "Facebook"], ["google", "Google"], ["tiktok", "TikTok"], ["line", "LINE"],
  ["friend", "เพื่อน/คนรู้จักแนะนำ"], ["repeat", "เคยใช้บริการแล้ว"], ["other", "อื่นๆ"],
] as const;

type Customer = { id: string; label: string };

export function QuoteForm({
  mode, options, initialService, initialCar, sessionToken, idempotencyKey, minPickup, customers = [],
}: {
  mode: "customer" | "staff";
  options: QuoteFormOptions;
  initialService?: string;
  initialCar?: string;
  sessionToken: string;
  idempotencyKey: string;
  /** datetime-local ขั้นต่ำ (เวลาไทย) คำนวณฝั่ง server */
  minPickup: string;
  customers?: Customer[];
}) {
  const router = useRouter();
  const services = options.services;
  const [service, setService] = useState(services.find((s) => s.service_type === initialService)?.service_type ?? services[0]?.service_type);
  const svc = services.find((s) => s.service_type === service);
  const [car, setCar] = useState(svc?.cars.find((c) => c.car_type === initialCar)?.car_type ?? svc?.cars[0]?.car_type);
  const carInfo = svc?.cars.find((c) => c.car_type === car);

  const [airport, setAirport] = useState<"BKK" | "DMK">("BKK");
  const [direction, setDirection] = useState<"arrival" | "departure">("arrival");
  const [flightNo, setFlightNo] = useState("");
  const [noFlight, setNoFlight] = useState(false);
  const [origin, setOrigin] = useState<PickedPlace | null>(null);
  const [destination, setDestination] = useState<PickedPlace | null>(null);
  const [stops, setStops] = useState<(PickedPlace | null)[]>([]);
  const [hours, setHours] = useState<number | null>(svc?.hours[0] ?? null);
  const [customerId, setCustomerId] = useState("");
  const [manual, setManual] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const isAirport = service === "airport_transfer";
  const isCharter = ["hourly_charter", "daily_charter", "driver_only"].includes(service ?? "");
  const maxPax = car === "driver_only" ? 15 : carInfo?.seats ?? 15;
  const maxBags = car === "driver_only" ? 20 : carInfo?.luggage ?? 20;
  // ช่องสถานที่ของงานสนามบิน: อีกฝั่งคือสนามบินที่เลือก
  const addressLabel = isAirport ? (direction === "arrival" ? "ส่งที่ (ปลายทาง)" : "รับที่ (ต้นทาง)") : null;

  function chooseService(v: string) {
    setService(v);
    const next = services.find((s) => s.service_type === v);
    setCar(next?.cars.find((c) => c.car_type === car)?.car_type ?? next?.cars[0]?.car_type);
    setHours(next?.hours[0] ?? null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const local: string[] = [];
    if (isAirport && !destination && direction === "arrival") local.push("กรุณาเลือกจุดส่ง");
    if (isAirport && !origin && direction === "departure") local.push("กรุณาเลือกจุดรับ");
    if (!isAirport && !origin) local.push("กรุณาเลือกจุดรับ");
    if (!isAirport && !isCharter && !destination) local.push(RULE_TH.DESTINATION_REQUIRED);
    if (isAirport && !noFlight && !flightNo.trim()) local.push(RULE_TH.FLIGHT_REQUIRED);
    if (mode === "staff" && !customerId) local.push("กรุณาเลือกลูกค้า");
    if (local.length) return setErrors(local);

    const body = {
      ...(mode === "staff" ? { customer_id: customerId } : {}),
      service_type: service,
      car_type: car,
      origin_place_id: isAirport && direction === "arrival" ? undefined : origin?.place_id,
      destination_place_id: isAirport && direction === "departure" ? undefined : isCharter ? undefined : destination?.place_id,
      stop_place_ids: stops.filter(Boolean).map((s) => s!.place_id),
      pickup_at: `${f.get("pickup_at")}:00+07:00`,
      hours: isCharter ? hours : null,
      pax: Number(f.get("pax")),
      luggage: Number(f.get("luggage")),
      child_seats: Number(f.get("child_seats") ?? 0),
      flight: isAirport ? { no: noFlight ? null : flightNo, airport, direction } : null,
      no_flight: isAirport && noFlight,
      notes: String(f.get("notes") ?? "") || null,
      source_answer: mode === "customer" ? String(f.get("source") ?? "") || null : null,
      session_token: sessionToken,
      manual: manual ? { distance_km: Number(f.get("distance_km")), duration_min: Number(f.get("duration_min")) } : null,
    };
    setBusy(true);
    setErrors([]);
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const err = out?.error;
      if (err?.code === "QUOTE_RULE") return setErrors((err.details.errors as string[]).map((c) => RULE_TH[c] ?? c));
      if (err?.code === "ROUTE_UNAVAILABLE" && mode === "staff") setManual(true);
      return setErrors([err?.message_th ?? "ขอราคาไม่สำเร็จ"]);
    }
    router.push(mode === "customer" ? `/liff/customer/quotes/${out.id}` : `/admin/quotes/${out.id}`);
    router.refresh();
  }

  if (!svc) return <p className="text-center text-muted">ตอนนี้ยังไม่มีบริการที่เปิดรับจอง</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "staff" && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">ลูกค้า <span className="text-bad">*</span></span>
          <select className={input} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">เลือกลูกค้า…</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">บริการ</legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {services.map((s) => (
            <button
              key={s.service_type}
              type="button"
              onClick={() => chooseService(s.service_type)}
              aria-pressed={s.service_type === service}
              className={"min-h-12 rounded-[var(--radius-btn)] px-2 text-sm font-medium " +
                (s.service_type === service ? "bg-navy text-white" : "border border-line bg-card")}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">ประเภทรถ</legend>
        <div className="space-y-2">
          {svc.cars.map((c) => (
            <label key={c.car_type}
              className={"flex cursor-pointer items-center justify-between rounded-xl bg-card px-3.5 py-3 " +
                (c.car_type === car ? "border-2 border-navy" : "border border-line")}>
              <span className="flex items-center gap-3">
                <input type="radio" name="car" value={c.car_type} aria-label={c.label} className="accent-navy" checked={c.car_type === car} onChange={() => setCar(c.car_type)} />
                <span>
                  <span className="block font-medium">{c.label}</span>
                  {c.seats && <span className="block text-xs text-muted">{c.seats} ที่นั่ง · {c.luggage} กระเป๋า</span>}
                </span>
              </span>
              <span className="text-sm">เริ่ม <b>{formatBaht(c.from_satang)}</b></span>
            </label>
          ))}
        </div>
      </fieldset>

      {isAirport && (
        <div className="space-y-3 rounded-xl bg-page p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-sm font-medium">สนามบิน</span>
              <select className={input} value={airport} onChange={(e) => setAirport(e.target.value as "BKK" | "DMK")}>
                <option value="BKK">BKK สุวรรณภูมิ</option>
                <option value="DMK">DMK ดอนเมือง</option>
              </select>
            </label>
            <label className="space-y-1">
              <span className="text-sm font-medium">เที่ยว</span>
              <select className={input} value={direction} onChange={(e) => setDirection(e.target.value as "arrival" | "departure")}>
                <option value="arrival">ขาเข้า · รับจากสนามบิน</option>
                <option value="departure">ขาออก · ไปส่งสนามบิน</option>
              </select>
            </label>
          </div>
          <label className="block space-y-1">
            <span className="text-sm font-medium">เลขเที่ยวบิน {!noFlight && <span className="text-bad">*</span>}</span>
            <input className={input} value={flightNo} disabled={noFlight} placeholder="เช่น TG123"
              onChange={(e) => setFlightNo(e.target.value.toUpperCase())} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-navy" checked={noFlight} onChange={(e) => setNoFlight(e.target.checked)} />
            ไม่มีเที่ยวบิน / ยังไม่ทราบ
          </label>
        </div>
      )}

      {isAirport ? (
        direction === "arrival"
          ? <PlaceInput label={addressLabel!} value={destination} onChange={setDestination} sessionToken={sessionToken} required />
          : <PlaceInput label={addressLabel!} value={origin} onChange={setOrigin} sessionToken={sessionToken} required />
      ) : (
        <>
          <PlaceInput label={isCharter ? "จุดรับ / จุดเริ่ม" : "ต้นทาง"} value={origin} onChange={setOrigin} sessionToken={sessionToken} required />
          {stops.map((s, i) => (
            <div key={i} className="flex items-end gap-2">
              <div className="flex-1">
                <PlaceInput label={`จุดแวะ ${i + 1}`} value={s} sessionToken={sessionToken}
                  onChange={(p) => setStops(stops.map((x, j) => (j === i ? p : x)))} />
              </div>
              <button type="button" className="pb-3 text-sm text-muted" onClick={() => setStops(stops.filter((_, j) => j !== i))}>ลบ</button>
            </div>
          ))}
          {stops.length < 5 && (
            <button type="button" className="text-sm text-navy underline" onClick={() => setStops([...stops, null])}>+ เพิ่มจุดแวะ</button>
          )}
          {!isCharter && <PlaceInput label="ปลายทาง" value={destination} onChange={setDestination} sessionToken={sessionToken} required />}
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">วันเวลารับ (เวลาไทย) <span className="text-bad">*</span></span>
          <input name="pickup_at" type="datetime-local" required min={minPickup} className={input} />
        </label>
        {isCharter && (
          <label className="col-span-2 block space-y-1 sm:col-span-1">
            <span className="text-sm font-medium">จำนวนชั่วโมง</span>
            {mode === "customer" && svc.hours.length > 0 ? (
              <select className={input} value={hours ?? ""} onChange={(e) => setHours(Number(e.target.value))}>
                {svc.hours.map((h) => <option key={h} value={h}>{h} ชั่วโมง</option>)}
              </select>
            ) : (
              <input type="number" min={1} max={24} className={input} value={hours ?? ""} onChange={(e) => setHours(Number(e.target.value))} />
            )}
          </label>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">ผู้โดยสาร</span>
          <input name="pax" type="number" min={1} max={maxPax} defaultValue={1} required className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">กระเป๋าใหญ่</span>
          <input name="luggage" type="number" min={0} max={maxBags} defaultValue={0} required className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">ที่นั่งเด็ก</span>
          <input name="child_seats" type="number" min={0} max={4} defaultValue={0} className={input} />
        </label>
      </div>
      {car !== "driver_only" && carInfo?.seats && (
        <p className="-mt-2 text-xs text-muted">รถประเภทนี้รับได้สูงสุด {carInfo.seats} คน · {carInfo.luggage} กระเป๋าใหญ่</p>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">หมายเหตุ</span>
        <textarea name="notes" rows={2} maxLength={1000} className={input} placeholder="เช่น มีผู้สูงอายุ ต้องการป้ายชื่อรับ" />
      </label>

      {mode === "customer" && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">รู้จักเราจากไหน</span>
          <select name="source" className={input} defaultValue="">
            <option value="">ไม่ระบุ</option>
            {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      )}

      {mode === "staff" && (
        <div className="space-y-2 rounded-xl bg-page p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-navy" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            กรอกระยะทางเอง (ใช้เมื่อระบบแผนที่ใช้ไม่ได้ — บันทึกว่า manual)
          </label>
          {manual && (
            <div className="grid grid-cols-2 gap-3">
              <input name="distance_km" type="number" min={0} step="0.1" required placeholder="ระยะทาง (กม.)" className={input} />
              <input name="duration_min" type="number" min={0} required placeholder="เวลาเดินทาง (นาที)" className={input} />
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      <div className="flex gap-2">
        <button className={`${btnPrimary} flex-1`} disabled={busy}>{busy ? "กำลังคำนวณราคา…" : "ขอใบเสนอราคา"}</button>
        {mode === "staff" && <button type="button" className={btnSecondary} onClick={() => router.back()}>ยกเลิก</button>}
      </div>
      <p className="text-center text-xs text-muted">ราคารวมน้ำมันและคนขับ · ไม่รวมทางด่วนและค่าจอด (เบิกตามจริง)</p>
    </form>
  );
}
