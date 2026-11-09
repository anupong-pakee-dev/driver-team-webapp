"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary } from "@/components/ui";

export function BuildPayouts() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-3">
      <button className={btnPrimary} onClick={async () => {
        const res = await fetch("/api/admin/payouts/build", { method: "POST" });
        const out = await res.json().catch(() => null);
        setMsg(res.ok ? `สร้าง ${out.created} รอบ (${out.jobs} งาน)` : "ไม่สำเร็จ");
        router.refresh();
      }}>สร้างรอบจ่ายตอนนี้</button>
      {msg && <span className="text-sm text-muted">{msg}</span>}
    </div>
  );
}

// FR-PAYOUT-03 โอนแล้ว + แนบหลักฐาน → แจ้งคนขับ
export function PayoutPaid({ payoutId }: { payoutId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const file = new FormData(e.currentTarget).get("file");
      if (!(file instanceof File) || !file.size) return setMsg("แนบหลักฐานการโอน");
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/admin/payouts/${payoutId}/paid`, { method: "POST", body });
      if (!res.ok) return setMsg("บันทึกไม่สำเร็จ");
      router.refresh();
    }}>
      <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
      <button className="rounded-lg bg-navy px-3 py-2 font-semibold text-white">โอนแล้ว</button>
      {msg && <span className="text-bad">{msg}</span>}
    </form>
  );
}
