"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, input } from "@/components/ui";

// เวลาที่กรอกเป็นเวลาไทย → ส่งเป็น ISO พร้อม +07:00
const toIso = (local: string) => `${local}:00+07:00`;

export function AddBlock() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    const res = await fetch("/api/me/availability", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ from: toIso(String(f.get("from"))), to: toIso(String(f.get("to"))) }),
    });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      return setError(err?.error?.details?.rule === "TIME_CONFLICT" ? "ช่วงนี้ทับกับช่วงที่ปิดไว้หรืองานที่รับแล้ว" : "เวลาไม่ถูกต้อง");
    }
    form.reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm font-medium">ตั้งแต่</span>
        <input name="from" type="datetime-local" required className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">ถึง</span>
        <input name="to" type="datetime-local" required className={input} />
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className={`${btnPrimary} w-full`} disabled={busy}>ปิดรับงานช่วงนี้</button>
    </form>
  );
}

export function RemoveBlock({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="shrink-0 rounded-lg border border-line px-3 py-1.5 text-sm"
      onClick={async () => {
        await fetch(`/api/me/availability/${id}`, { method: "DELETE" });
        router.refresh();
      }}
    >
      เปิดรับ
    </button>
  );
}
