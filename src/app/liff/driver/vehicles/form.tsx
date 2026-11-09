"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, input } from "@/components/ui";

type V = { car_type: string; plate: string; seats: number; luggage: number };
const CARS = [
  { value: "sedan", label: "รถเก๋ง" },
  { value: "suv", label: "SUV" },
  { value: "van", label: "รถตู้" },
  { value: "van_vip", label: "รถตู้ VIP" },
  { value: "mpv_premium", label: "MPV พรีเมียม (Alphard)" },
];

// FR-VEH-01 ข้อมูลพื้นฐาน · ประเภทจดทะเบียนมาจากเล่มทะเบียนที่ owner อนุมัติ
export function VehicleForm({ id, initial }: { id?: string; initial?: V }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      car_type: f.get("car_type"),
      plate: f.get("plate"),
      seats: Number(f.get("seats")),
      luggage: Number(f.get("luggage")),
    };
    setBusy(true);
    const res = await fetch(id ? `/api/me/vehicles/${id}` : "/api/me/vehicles", {
      method: id ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return setError(err?.error?.details?.problem === "duplicate" ? "ทะเบียนนี้มีในระบบแล้ว" : err?.error?.message_th ?? "บันทึกไม่สำเร็จ");
    }
    const out = await res.json();
    router.push(`/liff/driver/vehicles/${id ?? out.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">ประเภทรถ</span>
        <select name="car_type" required defaultValue={initial?.car_type ?? ""} className={input}>
          <option value="" disabled>เลือก…</option>
          {CARS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">ทะเบียน</span>
        <input name="plate" required defaultValue={initial?.plate} placeholder="เช่น 1กข1234กรุงเทพมหานคร" className={input} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">ที่นั่งผู้โดยสาร</span>
          <input name="seats" type="number" min={1} max={15} required defaultValue={initial?.seats} className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">กระเป๋าใบใหญ่</span>
          <input name="luggage" type="number" min={0} max={20} required defaultValue={initial?.luggage} className={input} />
        </label>
      </div>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className={`${btnPrimary} w-full`} disabled={busy}>{id ? "บันทึก" : "เพิ่มรถ แล้วส่งเอกสาร"}</button>
    </form>
  );
}
