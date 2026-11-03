"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBaht } from "@/lib/money";
import { btnPrimary, input } from "@/components/ui";

// FR-QUOTE-02: ≤ เพดานทันที · เกินเพดาน (sales_admin) รอ owner · ต่ำกว่า floor ปฏิเสธ
export function DiscountForm({ id, computed, floor, maxPct, role }: {
  id: string; computed: number; floor: number; maxPct: number; role: string;
}) {
  const router = useRouter();
  const [baht, setBaht] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  const discount = Math.round(Number(baht || 0) * 100);
  const final = computed - discount;
  const overCap = role === "sales_admin" && discount > computed * maxPct;
  const belowFloor = final < floor;

  async function submit() {
    const res = await fetch(`/api/quotes/${id}/discount`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ discount_satang: discount, reason }),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok) return setMsg(out?.error?.code === "BELOW_FLOOR" ? "ต่ำกว่าราคาขั้นต่ำ" : out?.error?.message_th ?? "ไม่สำเร็จ");
    router.push(`/admin/quotes/${out.id}`);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <input className={input} type="number" min={0} step="1" placeholder="ลด (บาท)" value={baht} onChange={(e) => setBaht(e.target.value)} />
      <input className={input} placeholder="เหตุผล เช่น ลูกค้าประจำ" value={reason} onChange={(e) => setReason(e.target.value)} />
      {discount > 0 && (
        <p className={"text-sm " + (belowFloor ? "text-bad" : overCap ? "text-warn" : "text-muted")}>
          ราคาใหม่ {formatBaht(final)} ({Math.round((discount / computed) * 1000) / 10}%)
          {belowFloor ? ` — ต่ำกว่าขั้นต่ำ ${formatBaht(floor)}` : overCap ? " — เกินเพดาน ต้องรอเจ้าของอนุมัติ" : ""}
        </p>
      )}
      {msg && <p className="text-sm text-bad">{msg}</p>}
      <button className={`${btnPrimary} w-full`} disabled={discount <= 0 || belowFloor || reason.trim().length < 3} onClick={submit}>
        {overCap ? "ส่งขออนุมัติ" : "ออกฉบับใหม่"}
      </button>
    </div>
  );
}

export function ApproveDiscount({ id }: { id: string }) {
  const router = useRouter();
  const decide = async (approve: boolean) => {
    await fetch(`/api/quotes/${id}/discount/approve`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ approve }),
    });
    router.refresh();
  };
  return (
    <div className="flex gap-2">
      <button className="flex-1 rounded-lg bg-ok px-3 py-2 font-semibold text-white" onClick={() => decide(true)}>อนุมัติ</button>
      <button className="flex-1 rounded-lg border border-line px-3 py-2" onClick={() => decide(false)}>ไม่อนุมัติ</button>
    </div>
  );
}
