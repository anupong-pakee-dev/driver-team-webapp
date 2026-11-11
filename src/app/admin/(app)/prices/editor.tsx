"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

type Rule = {
  id: string; car_type: string; service_type: string; base_satang: number; included_km: number; per_km_satang: number;
  included_minutes: number; ot_per_hour_satang: number; wait_per_hour_satang: number; free_wait_minutes: number;
  floor_satang: number; tax_category: string;
};

// ฟอร์มกรอกเป็น "บาท" / "ชั่วโมง" แล้วแปลงเป็นสตางค์ / นาที ก่อนส่ง
const FIELDS = [
  ["base", "ค่าบริการพื้นฐาน (บาท)", "base_satang", 100],
  ["floor", "ราคาขั้นต่ำ (บาท)", "floor_satang", 100],
  ["ikm", "รวมระยะ (กม.)", "included_km", 1],
  ["pkm", "เกิน กม.ละ (บาท)", "per_km_satang", 100],
  ["ihr", "รวมเวลา (ชม.)", "included_minutes", 1 / 60],
  ["ot", "ชม.เกิน ชม.ละ (บาท)", "ot_per_hour_satang", 100],
  ["wait", "ค่ารอ ชม.ละ (บาท)", "wait_per_hour_satang", 100],
  ["fw", "รอฟรี (นาที)", "free_wait_minutes", 1],
] as const;

export function PriceRuleEditor({ rule, newFor, carOptions }: {
  rule?: Rule; newFor?: string; carOptions?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (newFor && carOptions?.length === 0) return null;

  if (!open) {
    return (
      <button className={rule ? "mt-1 text-sm text-sage underline" : btnSecondary} onClick={() => setOpen(true)}>
        {rule ? "แก้ราคา" : "+ เปิดขายรถประเภทอื่น"}
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      reason: f.get("reason"),
      car_type: rule?.car_type ?? f.get("car_type"),
      service_type: rule?.service_type ?? newFor,
      tax_category: f.get("tax_category"),
    };
    for (const [name, , key, mult] of FIELDS) body[key] = Math.round(Number(f.get(name)) * (mult === 1 / 60 ? 60 : mult));
    const res = await fetch("/api/admin/price-rules", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const out = await res.json().catch(() => null);
      return setError(out?.error?.details?.field === "floor_satang" ? "ราคาขั้นต่ำต้องไม่เกินค่าบริการพื้นฐาน" : out?.error?.message_th ?? "บันทึกไม่สำเร็จ");
    }
    setOpen(false);
    router.refresh();
  }

  const val = (key: string, mult: number) => {
    if (!rule) return undefined;
    const v = rule[key as keyof Rule] as number;
    return mult === 1 / 60 ? v / 60 : v / mult;
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-page p-3">
      {!rule && (
        <select name="car_type" required className={input} defaultValue="">
          <option value="" disabled>ประเภทรถ…</option>
          {carOptions?.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {FIELDS.map(([name, label, key, mult]) => (
          <label key={name} className="space-y-1">
            <span className="block text-xs text-muted">{label}</span>
            <input name={name} type="number" min={0} step="any" required defaultValue={val(key, mult)} className={`${input} py-2`} />
          </label>
        ))}
      </div>
      <label className="block space-y-1">
        <span className="block text-xs text-muted">หมวดภาษี ❓ นักบัญชียืนยัน</span>
        <select name="tax_category" defaultValue={rule?.tax_category ?? "transport"} className={`${input} py-2`}>
          <option value="transport">transport (ขนส่ง)</option>
          <option value="rental">rental (ให้เช่า)</option>
          <option value="service">service (บริการ)</option>
        </select>
      </label>
      <input name="reason" required minLength={3} placeholder="เหตุผลที่แก้ (บังคับ)" className={input} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary}>บันทึกเป็นราคาใหม่</button>
        <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>ยกเลิก</button>
      </div>
    </form>
  );
}
