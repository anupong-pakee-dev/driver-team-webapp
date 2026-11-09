import "server-only";
import { DOC_TYPES, type OwnerType } from "@/domain/documents";
import type { Db } from "@/lib/db";
import { getSetting } from "@/lib/settings";

// ข้อมูลสำหรับหน้าจอ (อ่านผ่าน RLS ด้วย db จาก asUser)

export type DocRow = {
  id: string;
  doc_type: string;
  status: "pending" | "approved" | "rejected" | "expired";
  reject_reason: string | null;
  expires_at: string | null;
  created_at: string;
  data: Record<string, unknown>;
};

export type DocSlot = {
  type: (typeof DOC_TYPES)[number];
  required: boolean;
  latest: DocRow | null;
  approved: DocRow | null;
};

export async function docSlots(db: Db, ownerType: OwnerType, ownerId: string): Promise<DocSlot[]> {
  const required = (await getSetting<{ required_docs?: Record<string, string[]> }>("compliance"))?.required_docs?.[ownerType] ?? [];
  const { rows } = await db.query<DocRow>(
    `select id, doc_type, status, reject_reason, expires_at::text, created_at, data
       from documents where owner_type = $1 and owner_id = $2 order by created_at desc`,
    [ownerType, ownerId],
  );
  return DOC_TYPES.filter((t) => t.owner === ownerType).map((type) => ({
    type,
    required: required.includes(type.type),
    latest: rows.find((r) => r.doc_type === type.type) ?? null,
    approved: rows.find((r) => r.doc_type === type.type && r.status === "approved") ?? null,
  }));
}

export type Option = { code: string; label_th: string };

export async function formOptions() {
  const [reg, lic] = await Promise.all([
    getSetting<Option[]>("registration_types"),
    getSetting<Option[]>("license_classes"),
  ]);
  return { registration_types: reg ?? [], license_classes: lic ?? [] };
}

export const CAR_TYPES = [
  { value: "sedan", label: "รถเก๋ง" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "รถตู้" },
  { value: "van_vip", label: "รถตู้ VIP" },
  { value: "mpv_premium", label: "MPV พรีเมียม (Alphard)" },
];
export const carLabel = (v: string) => CAR_TYPES.find((c) => c.value === v)?.label ?? v;

export const SERVICE_TYPES = [
  { value: "airport_transfer", label: "สนามบิน" },
  { value: "point_to_point", label: "ต่างจังหวัด A→B" },
  { value: "hourly_charter", label: "เหมารายชั่วโมง" },
  { value: "daily_charter", label: "เหมารายวัน" },
  { value: "driver_only", label: "คนขับอย่างเดียว" },
];
