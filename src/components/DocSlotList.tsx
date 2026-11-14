import type { DocSlot, Option } from "@/services/portal";
import { DocUploader } from "./DocUploader";
import { Badge } from "./ui";

// รายการเอกสารต่อประเภท + สถานะ + ปุ่มส่ง (ฝั่งคนขับ)
// เอกสารบังคับขึ้นก่อน (ดอกจันแดง + นับความคืบหน้า) · เอกสารไม่บังคับพับไว้ด้านล่าง ไม่รก
export function DocSlotList({
  ownerType, ownerId, slots, options,
}: {
  ownerType: "driver" | "vehicle";
  ownerId: string;
  slots: DocSlot[];
  options: { registration_types: Option[]; license_classes: Option[] };
}) {
  const required = slots.filter((s) => s.required);
  const optional = slots.filter((s) => !s.required);
  const done = required.filter((s) => s.approved || s.latest?.status === "pending").length;

  const item = (s: DocSlot) => {
    const l = s.latest;
    const status =
      !l ? <Badge tone={s.required ? "warn" : "info"}>ยังไม่ส่ง</Badge>
      : l.status === "pending" ? <Badge tone="info">รอตรวจ</Badge>
      : l.status === "approved" ? <Badge tone="ok">ผ่าน</Badge>
      : l.status === "rejected" ? <Badge tone="bad">ไม่ผ่าน</Badge>
      : <Badge tone="bad">หมดอายุ</Badge>;
    return (
      <li key={s.type.type} className="py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="font-medium">
              {s.type.label}
              {s.required && <span className="text-bad" aria-label="จำเป็น"> *</span>}
            </div>
            {s.approved?.expires_at && <div className="text-xs text-muted">หมดอายุ {s.approved.expires_at}</div>}
            {l?.status === "rejected" && l.reject_reason && <div className="text-xs text-bad">เหตุผล: {l.reject_reason}</div>}
            {l?.status === "pending" && s.approved && <div className="text-xs text-muted">ฉบับใหม่รอตรวจ — ฉบับเดิมยังใช้ได้</div>}
          </div>
          {status}
        </div>
        {l?.status !== "pending" && (
          <div className="mt-2">
            <DocUploader ownerType={ownerType} ownerId={ownerId} def={s.type} options={options}
              subtle={!!s.approved || !s.required}
              label={s.approved ? (s.type.expiryField ? "ส่งฉบับต่ออายุ" : "ส่งใหม่") : l ? "ส่งใหม่" : "ส่งเอกสาร"} />
          </div>
        )}
      </li>
    );
  };

  return (
    <div>
      {required.length > 0 && (
        <p className={"mb-1 text-sm " + (done === required.length ? "text-ok" : "text-muted")}>
          {done === required.length ? "ส่งเอกสารที่จำเป็นครบแล้ว ✓" : `เอกสารที่จำเป็น (*) ส่งแล้ว ${done}/${required.length}`}
        </p>
      )}
      <ul className="divide-y divide-line">{required.map(item)}</ul>
      {optional.length > 0 && (
        <details className="mt-2 border-t border-line pt-2">
          <summary className="cursor-pointer py-2 text-sm text-muted">เอกสารเพิ่มเติม (ไม่บังคับ) · {optional.length} รายการ</summary>
          <ul className="divide-y divide-line">{optional.map(item)}</ul>
        </details>
      )}
    </div>
  );
}
