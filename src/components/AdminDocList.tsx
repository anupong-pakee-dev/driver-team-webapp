import { docType, INSURANCE_USAGE } from "@/domain/documents";
import type { DocSlot } from "@/services/portal";
import { formatBangkok } from "@/lib/time";
import { formatBaht } from "@/lib/money";
import { ReviewButtons } from "@/app/admin/(app)/actions";
import { Badge } from "./ui";

const STATUS = {
  pending: ["รอตรวจ", "info"], approved: ["ผ่าน", "ok"], rejected: ["ไม่ผ่าน", "bad"], expired: ["หมดอายุ", "bad"],
} as const;

function showValue(key: string, v: unknown, labels: Record<string, string>) {
  if (key === "registration_type" || key === "license_class") return labels[String(v)] ?? String(v);
  if (key === "sum_baht") return formatBaht(Number(v));
  if (key === "usage") return INSURANCE_USAGE.find((u) => u.value === v)?.label ?? String(v);
  return String(v);
}

// หน้าคนขับ/รถฝั่ง owner: เอกสารล่าสุดต่อประเภท + ข้อมูลที่กรอก + ปุ่มตรวจ (เฉพาะ owner — sales_admin ไม่เห็นเอกสาร)
export function AdminDocList({ slots, canReview, labels = {} }: { slots: DocSlot[]; canReview: boolean; labels?: Record<string, string> }) {
  return (
    <ul className="divide-y divide-line">
      {slots.map((s) => {
        const l = s.latest;
        const def = docType(s.type.type)!;
        return (
          <li key={s.type.type} className="py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{s.type.label}</span>
              {!s.required && <span className="text-xs text-muted">(ไม่บังคับ)</span>}
              {l ? <Badge tone={STATUS[l.status][1]}>{STATUS[l.status][0]}</Badge> : <Badge tone="warn">ยังไม่ส่ง</Badge>}
              {s.approved && l?.id !== s.approved.id && <Badge tone="ok">มีฉบับที่ผ่านแล้ว</Badge>}
              {l && <span className="ml-auto text-xs text-muted">ส่งเมื่อ {formatBangkok(l.created_at)}</span>}
            </div>
            {l && (
              <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 text-sm">
                  {def.fields.filter((f) => f.type !== "secret").map((f) => (
                    <div key={f.key} className="contents">
                      <dt className="text-muted">{f.label}</dt>
                      <dd>{l.data[f.key] !== undefined ? showValue(f.key, l.data[f.key], labels) : "—"}</dd>
                    </div>
                  ))}
                  {def.fields.some((f) => f.type === "secret") && (
                    <><dt className="text-muted">ข้อมูลลับ</dt><dd className="text-muted">เข้ารหัสไว้</dd></>
                  )}
                  {l.reject_reason && <><dt className="text-bad">เหตุผล</dt><dd className="text-bad">{l.reject_reason}</dd></>}
                </dl>
                <div className="flex flex-col items-end gap-2">
                  {canReview && (
                    <a href={`/api/admin/documents/${l.id}/file`} target="_blank" rel="noreferrer" className="text-sm text-sage underline">
                      เปิดไฟล์ ↗
                    </a>
                  )}
                  {canReview && l.status === "pending" && <ReviewButtons docId={l.id} />}
                </div>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
