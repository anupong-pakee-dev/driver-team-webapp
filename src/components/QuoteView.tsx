import type { QuoteViewData } from "@/services/quoteView";
import { QUOTE_STATUS_TH } from "@/services/quoteView";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { Badge } from "./ui";

// ใบเสนอราคา (FR-QUOTE-01) — ใช้ทั้งหน้าลูกค้าและหลังบ้าน · พิมพ์/บันทึก PDF ได้จากเบราว์เซอร์
export function QuoteView({ q, brand, showCosting = false }: { q: QuoteViewData; brand: string; showCosting?: boolean }) {
  const st = QUOTE_STATUS_TH[q.status] ?? [q.status, "info"];
  const service = SERVICE_TYPES.find((s) => s.value === q.service_type)?.label ?? q.service_type;
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
          <div className="text-xs text-muted">{brand} · ใบเสนอราคา</div>
          <h2 className="text-xl font-bold">
            {q.number}{q.revision > 1 && <span className="text-muted"> rev.{q.revision}</span>}
          </h2>
          <div className="text-xs text-muted">ออกเมื่อ {formatBangkok(q.created_at)}</div>
        </div>
        <Badge tone={st[1]}>{st[0]}</Badge>
      </header>

      <dl className="text-sm">
        {line("บริการ", `${service} · ${carLabel(q.car_type)}`)}
        {q.flight_no && line("เที่ยวบิน", `${q.flight_no} (${q.airport} ${q.flight_direction === "arrival" ? "ขาเข้า" : "ขาออก"})`)}
        {q.no_flight && line("เที่ยวบิน", "ไม่ระบุ")}
        {line("รับ", q.origin?.name ?? "—")}
        {q.stops.map((s, i) => <div key={i}>{line(`แวะ ${i + 1}`, s.name)}</div>)}
        {q.destination && line("ส่ง", q.destination.name)}
        {line("วันเวลา", formatBangkok(q.pickup_at))}
        {q.hours && line("ระยะเวลาเหมา", `${q.hours} ชั่วโมง`)}
        {line("ผู้โดยสาร", `${q.pax} คน · ${q.luggage} กระเป๋า${q.child_seats ? ` · ที่นั่งเด็ก ${q.child_seats}` : ""}`)}
        {q.distance_m !== null && line("ระยะทางโดยประมาณ", `${b.km} กม.${q.distance_source === "manual" ? " (กรอกโดยแอดมิน)" : ""}`)}
        {q.notes && line("หมายเหตุ", q.notes)}
      </dl>

      <dl className="border-t border-line pt-3 text-sm">
        {line("ค่าบริการพื้นฐาน", formatBaht(b.base))}
        {b.km_charge > 0 && line(`ระยะเกิน ${b.extra_km} กม.`, formatBaht(b.km_charge))}
        {b.ot_charge > 0 && line(`ชั่วโมงเกิน ${b.ot_hours} ชม.`, formatBaht(b.ot_charge))}
        {b.extras > 0 && line("ที่นั่งเด็ก / จุดแวะ", formatBaht(b.extras))}
        {b.computed !== b.subtotal && line("ปัดเศษ", formatBaht(b.computed - b.subtotal))}
        {q.discount_satang > 0 && line(`ส่วนลด${q.discount_reason ? ` (${q.discount_reason})` : ""}`, `−${formatBaht(q.discount_satang)}`)}
        {line("รวม", formatBaht(q.final_satang), true)}
        {line("มัดจำเพื่อยืนยัน", formatBaht(q.deposit_satang))}
      </dl>

      <ul className="space-y-1 rounded-xl bg-page px-4 py-3 text-xs text-muted">
        <li>✓ รวมน้ำมันและคนขับ</li>
        <li>✗ ไม่รวมทางด่วน ค่าจอด และที่พักคนขับ (เบิกตามจริงพร้อมใบเสร็จ)</li>
        <li>ใบเสนอราคาหมดอายุ {formatBangkok(q.expires_at)}</li>
        {showCosting && <li>หมวดภาษี: {q.tax_category} · กฎราคา ณ วันที่ออก</li>}
      </ul>
    </article>
  );
}
