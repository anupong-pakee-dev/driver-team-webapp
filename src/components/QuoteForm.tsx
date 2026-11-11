"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { QuoteFormOptions } from "@/services/quoteForm";
import { apiErrorText } from "@/i18n";
import { formatBaht } from "@/lib/money";
import { useI18n } from "./I18nProvider";
import { LocationInput, type PickedPlace } from "./LocationInput";
import { btnPrimary, btnSecondary, floatBar, floatBarDesk, input, segItem, segWrap } from "./ui";

const SOURCES = ["facebook", "google", "tiktok", "line", "friend", "repeat", "other"] as const;

type Customer = { id: string; label: string };

const point = (p: PickedPlace | null) => (p ? { lat: p.lat, lng: p.lng, name: p.name.trim() || undefined, source: p.source } : undefined);

export function QuoteForm({
  mode, options, initialService, initialCar, idempotencyKey, minPickup, customers = [],
}: {
  mode: "customer" | "staff";
  options: QuoteFormOptions;
  initialService?: string;
  initialCar?: string;
  idempotencyKey: string;
  /** datetime-local ขั้นต่ำ (เวลาไทย) คำนวณฝั่ง server */
  minPickup: string;
  customers?: Customer[];
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const f = t.quoteForm;
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
  const addressLabel = isAirport ? (direction === "arrival" ? f.dropAt : f.pickupAt) : null;

  function chooseService(v: string) {
    setService(v);
    const next = services.find((s) => s.service_type === v);
    setCar(next?.cars.find((c) => c.car_type === car)?.car_type ?? next?.cars[0]?.car_type);
    setHours(next?.hours[0] ?? null);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const local: string[] = [];
    if (isAirport && !destination && direction === "arrival") local.push(f.needDrop);
    if (isAirport && !origin && direction === "departure") local.push(f.needPickup);
    if (!isAirport && !origin) local.push(f.needPickup);
    if (stops.some((s) => !s)) local.push(f.needStops);
    if (!isAirport && !isCharter && !destination) local.push(t.quoteRule.DESTINATION_REQUIRED);
    if (isAirport && !noFlight && !flightNo.trim()) local.push(t.quoteRule.FLIGHT_REQUIRED);
    if (mode === "staff" && !customerId) local.push(f.needCustomer);
    if (local.length) return setErrors(local);

    const body = {
      ...(mode === "staff" ? { customer_id: customerId } : {}),
      service_type: service,
      car_type: car,
      origin: isAirport && direction === "arrival" ? undefined : point(origin),
      destination: isAirport && direction === "departure" ? undefined : isCharter ? undefined : point(destination),
      stops: stops.filter(Boolean).map((s) => point(s)!),
      pickup_at: `${fd.get("pickup_at")}:00+07:00`,
      hours: isCharter ? hours : null,
      pax: Number(fd.get("pax")),
      luggage: Number(fd.get("luggage")),
      child_seats: Number(fd.get("child_seats") ?? 0),
      flight: isAirport ? { no: noFlight ? null : flightNo, airport, direction } : null,
      no_flight: isAirport && noFlight,
      notes: String(fd.get("notes") ?? "") || null,
      source_answer: mode === "customer" ? String(fd.get("source") ?? "") || null : null,
      manual: manual ? { distance_km: Number(fd.get("distance_km")), duration_min: Number(fd.get("duration_min")) } : null,
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
      if (err?.code === "QUOTE_RULE") return setErrors((err.details.errors as string[]).map((c) => t.quoteRule[c] ?? c));
      return setErrors([apiErrorText(out, locale) ?? f.failed]);
    }
    router.push(mode === "customer" ? `/liff/customer/quotes/${out.id}` : `/admin/quotes/${out.id}`);
    router.refresh();
  }

  if (!svc) return <p className="text-center text-muted">{f.noServices}</p>;

  return (
    <form onSubmit={submit} className="space-y-4">
      {mode === "staff" && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">{f.customer} <span className="text-bad">*</span></span>
          <select className={input} value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
            <option value="">{f.chooseCustomer}</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
      )}

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{f.service}</legend>
        <div className={`${segWrap} ${services.length > 3 ? "grid-cols-2" : "grid-cols-3"}`}>
          {services.map((s) => (
            <button
              key={s.service_type}
              type="button"
              onClick={() => chooseService(s.service_type)}
              aria-pressed={s.service_type === service}
              className={segItem(s.service_type === service)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">{f.carType}</legend>
        <div className="space-y-2">
          {svc.cars.map((c) => (
            <label key={c.car_type}
              className={"flex cursor-pointer items-center justify-between rounded-[1.125rem] bg-card px-3.5 py-3 " +
                (c.car_type === car ? "border-2 border-sage" : "border border-line")}>
              <span className="flex items-center gap-3">
                <input type="radio" name="car" value={c.car_type} aria-label={c.label} className="accent-sage" checked={c.car_type === car} onChange={() => setCar(c.car_type)} />
                <span>
                  <span className="block font-medium">{c.label}</span>
                  {c.seats && <span className="block text-xs text-muted">{t.seats(c.seats, c.luggage ?? 0)}</span>}
                </span>
              </span>
              <span className="text-sm">{f.from} <b>{formatBaht(c.from_satang)}</b></span>
            </label>
          ))}
        </div>
      </fieldset>

      {isAirport && (
        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-muted">{f.airport} · {f.direction}</legend>
            <div className={`${segWrap} grid-cols-2`}>
              {(["BKK", "DMK"] as const).map((a) => (
                <button key={a} type="button" aria-pressed={airport === a} onClick={() => setAirport(a)} className={segItem(airport === a)}>
                  {a === "BKK" ? f.bkk : f.dmk}
                </button>
              ))}
            </div>
            <div className={`${segWrap} grid-cols-2`}>
              {(["arrival", "departure"] as const).map((d) => (
                <button key={d} type="button" aria-pressed={direction === d} onClick={() => setDirection(d)} className={segItem(direction === d)}>
                  {d === "arrival" ? f.arrival : f.departure}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="space-y-2">
            <label htmlFor="flight-no" className="block text-sm font-semibold text-muted">
              {f.flightNo} {!noFlight && <span className="text-bad">*</span>}
            </label>
            <div className="flex gap-2">
              <input id="flight-no" className={`${input} flex-1 font-semibold tracking-wide`} value={flightNo} disabled={noFlight} placeholder={f.flightPh}
                onChange={(e) => setFlightNo(e.target.value.toUpperCase())} />
              <label className={"flex max-w-[45%] cursor-pointer items-center gap-2 rounded-[0.875rem] border px-3 text-xs leading-tight " +
                (noFlight ? "border-sage bg-sage-soft font-semibold text-sage" : "border-line text-muted")}>
                <input type="checkbox" className="h-4 w-4 shrink-0 accent-sage" checked={noFlight} onChange={(e) => setNoFlight(e.target.checked)} />
                {f.noFlight}
              </label>
            </div>
          </div>
        </div>
      )}

      {isAirport ? (
        direction === "arrival"
          ? <LocationInput label={addressLabel!} value={destination} onChange={setDestination} required />
          : <LocationInput label={addressLabel!} value={origin} onChange={setOrigin} required />
      ) : (
        <>
          <LocationInput label={isCharter ? f.pickupStart : f.origin} value={origin} onChange={setOrigin} required />
          {stops.map((s, i) => (
            <div key={i} className="space-y-1">
              <LocationInput label={f.stop(i + 1)} value={s}
                onChange={(p) => setStops(stops.map((x, j) => (j === i ? p : x)))} />
              <button type="button" className="text-sm text-muted underline" onClick={() => setStops(stops.filter((_, j) => j !== i))}>{f.removeStop}</button>
            </div>
          ))}
          {stops.length < 5 && (
            <button type="button" className="text-sm text-sage underline" onClick={() => setStops([...stops, null])}>{f.addStop}</button>
          )}
          {!isCharter && <LocationInput label={f.destination} value={destination} onChange={setDestination} required />}
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className="col-span-2 block space-y-1 sm:col-span-1">
          <span className="text-sm font-medium">{f.pickupTime} <span className="text-bad">*</span></span>
          <input name="pickup_at" type="datetime-local" required min={minPickup} className={input} />
        </label>
        {isCharter && (
          <label className="col-span-2 block space-y-1 sm:col-span-1">
            <span className="text-sm font-medium">{f.hours}</span>
            {mode === "customer" && svc.hours.length > 0 ? (
              <select className={input} value={hours ?? ""} onChange={(e) => setHours(Number(e.target.value))}>
                {svc.hours.map((h) => <option key={h} value={h}>{f.hoursOpt(h)}</option>)}
              </select>
            ) : (
              <input type="number" min={1} max={24} className={input} value={hours ?? ""} onChange={(e) => setHours(Number(e.target.value))} />
            )}
          </label>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">{f.pax}</span>
          <input name="pax" type="number" min={1} max={maxPax} defaultValue={1} required className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{f.bags}</span>
          <input name="luggage" type="number" min={0} max={maxBags} defaultValue={0} required className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">{f.childSeats}</span>
          <input name="child_seats" type="number" min={0} max={4} defaultValue={0} className={input} />
        </label>
      </div>
      {car !== "driver_only" && carInfo?.seats && (
        <p className="-mt-2 text-xs text-muted">{f.carMax(carInfo.seats, carInfo.luggage ?? 0)}</p>
      )}

      <label className="block space-y-1">
        <span className="text-sm font-medium">{f.notes}</span>
        <textarea name="notes" rows={2} maxLength={1000} className={input} placeholder={f.notesPh} />
      </label>

      {mode === "customer" && (
        <label className="block space-y-1">
          <span className="text-sm font-medium">{f.source}</span>
          <select name="source" className={input} defaultValue="">
            <option value="">{f.notSpecified}</option>
            {SOURCES.map((v) => <option key={v} value={v}>{f.sources[v]}</option>)}
          </select>
        </label>
      )}

      {mode === "staff" && (
        <div className="space-y-2 rounded-xl bg-page p-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-sage" checked={manual} onChange={(e) => setManual(e.target.checked)} />
            {f.manual}
          </label>
          {manual && (
            <div className="grid grid-cols-2 gap-3">
              <input name="distance_km" type="number" min={0} step="0.1" required placeholder={f.distancePh} className={input} />
              <input name="duration_min" type="number" min={0} required placeholder={f.durationPh} className={input} />
            </div>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad" role="alert">
          {errors.map((e) => <li key={e}>{e}</li>)}
        </ul>
      )}

      {mode === "customer" ? (
        <div className={floatBar + floatBarDesk}>
          <div className="min-w-0">
            <div className="truncate text-xs text-on-dark">{carInfo?.label ?? svc.label} · {svc.label}</div>
            <div className="text-xl font-bold">{carInfo ? `${f.from} ${formatBaht(carInfo.from_satang)}` : "—"}</div>
          </div>
          <button className="flex h-[52px] shrink-0 items-center rounded-[1.125rem] bg-sand px-5 text-base font-bold text-forest disabled:opacity-50" disabled={busy}>
            {busy ? f.submitting : f.submit}
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className={`${btnPrimary} flex-1`} disabled={busy}>{busy ? f.submitting : f.submit}</button>
          <button type="button" className={btnSecondary} onClick={() => router.back()}>{f.back}</button>
        </div>
      )}
      <p className="text-center text-xs text-muted">{f.footer}</p>
    </form>
  );
}
