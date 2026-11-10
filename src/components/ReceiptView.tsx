import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { messages, type Locale } from "@/i18n";

export type ReceiptData = {
  number: string; issued_at: string; amount_satang: number; tax_category: string; is_tax_invoice: boolean;
  kind: string; method: string; service_type: string; car_type: string; pickup_at: string; quote_number: string;
  customer_name: string | null;
};

// FR-PAY-06 ใบเสร็จรับเงิน — พิมพ์/บันทึก PDF ได้ · ❓ รูปแบบและข้อความตามกฎหมายบัญชีรอนักบัญชี
// หัวข้อแปลตามภาษาลูกค้า · ชื่อ/ที่อยู่บริษัทใช้ตามทะเบียน (ภาษาไทย)
export function ReceiptView({ r, company, locale = "th" }: {
  r: ReceiptData; company: { name_th: string; tax_id: string; address_th: string }; locale?: Locale;
}) {
  const t = messages(locale);
  const v = t.receipt;
  const service = t.service[r.service_type] ?? r.service_type;
  return (
    <article className="space-y-4 rounded-[var(--radius-card)] border border-line bg-card p-5 text-sm">
      <header className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="font-bold">{company.name_th}</div>
          {company.tax_id && <div className="text-xs text-muted">{v.taxId(company.tax_id)}</div>}
          {company.address_th && <div className="text-xs text-muted">{company.address_th}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{r.is_tax_invoice ? v.receiptTax : v.receipt}</div>
          <div className="font-mono">{r.number}</div>
          <div className="text-xs text-muted">{formatBangkok(r.issued_at, locale)}</div>
        </div>
      </header>
      <dl className="space-y-1">
        {r.customer_name && <div className="flex justify-between gap-3"><dt className="text-muted">{v.from}</dt><dd>{r.customer_name}</dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-muted">{v.item}</dt><dd className="text-right">{t.paymentKind[r.kind]} · {service} · {t.car[r.car_type] ?? r.car_type}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{v.tripDate}</dt><dd>{formatBangkok(r.pickup_at, locale)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{v.ref}</dt><dd>{r.quote_number}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">{v.paidBy}</dt><dd>{t.paymentMethod[r.method] ?? r.method}</dd></div>
      </dl>
      <div className="flex justify-between border-t border-line pt-3 text-base">
        <span className="font-bold">{v.amount}</span>
        <span className="font-bold">{formatBaht(r.amount_satang)}</span>
      </div>
    </article>
  );
}
