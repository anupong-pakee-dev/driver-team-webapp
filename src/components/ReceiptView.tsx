import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { PAYMENT_KIND_TH } from "@/services/bookingView";

export type ReceiptData = {
  number: string; issued_at: string; amount_satang: number; tax_category: string; is_tax_invoice: boolean;
  kind: string; method: string; service_type: string; car_type: string; pickup_at: string; quote_number: string;
  customer_name: string | null;
};

const METHOD_TH: Record<string, string> = { slip: "โอนพร้อมเพย์", gateway: "พร้อมเพย์ (ผ่านผู้ให้บริการชำระเงิน)", manual: "โอนเข้าบัญชีบริษัท" };

// FR-PAY-06 ใบเสร็จรับเงิน — พิมพ์/บันทึก PDF ได้ · ❓ รูปแบบและข้อความตามกฎหมายบัญชีรอนักบัญชี
export function ReceiptView({ r, company }: { r: ReceiptData; company: { name_th: string; tax_id: string; address_th: string } }) {
  const service = SERVICE_TYPES.find((s) => s.value === r.service_type)?.label ?? r.service_type;
  return (
    <article className="space-y-4 rounded-[var(--radius-card)] border border-line bg-card p-5 text-sm">
      <header className="flex items-start justify-between gap-3 border-b border-line pb-3">
        <div>
          <div className="font-bold">{company.name_th}</div>
          {company.tax_id && <div className="text-xs text-muted">เลขประจำตัวผู้เสียภาษี {company.tax_id}</div>}
          {company.address_th && <div className="text-xs text-muted">{company.address_th}</div>}
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{r.is_tax_invoice ? "ใบเสร็จรับเงิน/ใบกำกับภาษี" : "ใบเสร็จรับเงิน"}</div>
          <div className="font-mono">{r.number}</div>
          <div className="text-xs text-muted">{formatBangkok(r.issued_at)}</div>
        </div>
      </header>
      <dl className="space-y-1">
        {r.customer_name && <div className="flex justify-between gap-3"><dt className="text-muted">ได้รับเงินจาก</dt><dd>{r.customer_name}</dd></div>}
        <div className="flex justify-between gap-3"><dt className="text-muted">รายการ</dt><dd className="text-right">{PAYMENT_KIND_TH[r.kind]} · {service} · {carLabel(r.car_type)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">วันเดินทาง</dt><dd>{formatBangkok(r.pickup_at)}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">อ้างอิง</dt><dd>{r.quote_number}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted">ชำระโดย</dt><dd>{METHOD_TH[r.method] ?? r.method}</dd></div>
      </dl>
      <div className="flex justify-between border-t border-line pt-3 text-base">
        <span className="font-bold">จำนวนเงิน</span>
        <span className="font-bold">{formatBaht(r.amount_satang)}</span>
      </div>
    </article>
  );
}
