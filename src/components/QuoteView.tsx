import type { QuoteViewData } from "@/services/quoteView";
import { QUOTE_STATUS_TH } from "@/services/quoteView";
import { messages, type Locale } from "@/i18n";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { Badge } from "./ui";

// ใบเสนอราคา (FR-QUOTE-01) — ใช้ทั้งหน้าลูกค้า (3 ภาษา) และหลังบ้าน (ไทย) · พิมพ์/บันทึก PDF ได้จากเบราว์เซอร์
export function QuoteView({ q, brand, showCosting = false, locale = "th" }: {
  q: QuoteViewData; brand: string; showCosting?: boolean; locale?: Locale;
}) {
  const t = messages(locale);
  const v = t.quote;
  const tone = QUOTE_STATUS_TH[q.status]?.[1] ?? "info";
  const service = t.service[q.service_type] ?? q.service_type;
  const when = (d: string) => formatBangkok(d, locale);
  const b = q.breakdown;
  const line = (label: string, value: string, strong = false) => (
    <div className="flex justify-between gap-4 py-1">
      <dt className={strong ? "font-bold" : "text-muted"}>{label}</dt>
      <dd className={"text-right " + (strong ? "text-lg font-bold" : "")}>{value}</dd>
    </div>
  );

  return (
    <article className="quote-print space-y-4 rounded-[var(--radius-card)] border border-line bg-card p-5">
      <header className="flex items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="text-xs text-muted">{brand} · {v.title}</div>
          <h2 className="text-xl font-bold">
            {q.number}{q.revision > 1 && <span className="text-muted"> rev.{q.revision}</span>}
          </h2>
          <div className="text-xs text-muted">{v.issued(when(q.created_at))}</div>
        </div>
        <Badge tone={tone}>{t.quoteStatus[q.status] ?? q.status}</Badge>
      </header>

      <dl className="text-sm">
        {line(v.service, `${service} · ${t.car[q.car_type] ?? q.car_type}`)}
        {q.flight_no && line(v.flight, `${q.flight_no} (${q.airport} ${q.flight_direction === "arrival" ? v.arrival : v.departure})`)}
        {q.no_flight && line(v.flight, v.noFlight)}
        {line(v.pickup, q.origin?.name ?? "—")}
        {q.stops.map((s, i) => <div key={i}>{line(v.stop(i + 1), s.name)}</div>)}
        {q.destination && line(v.drop, q.destination.name)}
        {line(v.when, when(q.pickup_at))}
        {q.hours && line(v.charter, v.hours(q.hours))}
        {line(v.pax, v.paxValue(q.pax, q.luggage, q.child_seats))}
        {q.distance_m !== null && line(v.distance, v.km(b.km, q.distance_source === "manual"))}
        {q.notes && line(v.notes, q.notes)}
      </dl>

      <dl className="border-t border-line pt-3 text-sm">
        {line(v.base, formatBaht(b.base))}
        {b.km_charge > 0 && line(v.extraKm(b.extra_km), formatBaht(b.km_charge))}
        {b.ot_charge > 0 && line(v.extraHours(b.ot_hours), formatBaht(b.ot_charge))}
        {b.extras > 0 && line(v.extras, formatBaht(b.extras))}
        {b.computed !== b.subtotal && line(v.rounding, formatBaht(b.computed - b.subtotal))}
        {q.discount_satang > 0 && line(v.discount(q.discount_reason), `−${formatBaht(q.discount_satang)}`)}
        {line(v.total, formatBaht(q.final_satang), true)}
        {line(v.deposit, formatBaht(q.deposit_satang))}
      </dl>

      <ul className="space-y-1 rounded-xl bg-page px-4 py-3 text-xs text-muted">
        <li>{v.includes}</li>
        <li>{v.excludes}</li>
        <li>{v.expires(when(q.expires_at))}</li>
        {showCosting && <li>หมวดภาษี: {q.tax_category} · กฎราคา ณ วันที่ออก</li>}
      </ul>
    </article>
  );
}
