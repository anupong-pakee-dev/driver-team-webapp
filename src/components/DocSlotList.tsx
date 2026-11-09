import type { DocSlot, Option } from "@/services/portal";
import { DocUploader } from "./DocUploader";
import { Badge } from "./ui";

// รายการเอกสารต่อประเภท + สถานะ + ปุ่มส่ง (ฝั่งคนขับ)
export function DocSlotList({
  ownerType, ownerId, slots, options,
}: {
  ownerType: "driver" | "vehicle";
  ownerId: string;
  slots: DocSlot[];
  options: { registration_types: Option[]; license_classes: Option[] };
}) {
  return (
    <ul className="divide-y divide-line">
      {slots.map((s) => {
        const l = s.latest;
        const status =
          !l ? <Badge tone="warn">ยังไม่ส่ง</Badge>
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
                  {!s.required && <span className="text-xs text-muted"> (ไม่บังคับ)</span>}
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
                  subtle={!!s.approved}
                  label={s.approved ? (s.type.expiryField ? "ส่งฉบับต่ออายุ" : "ส่งใหม่") : l ? "ส่งใหม่" : "ส่งเอกสาร"} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
