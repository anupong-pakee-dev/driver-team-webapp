"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

const ERR: Record<string, string> = {
  OFFER_EXPIRED: "ข้อเสนอหมดเวลาแล้ว",
  OFFER_TAKEN: "งานนี้มีคนรับไปแล้ว",
  TIME_CONFLICT: "เวลาชนกับงานอื่นหรือช่วงที่ปิดไว้",
  NOT_ELIGIBLE: "เอกสาร/รถไม่ผ่านเกณฑ์ ณ วันงาน",
};

// FR-DISP-02 รับ/ปฏิเสธ (ปฏิเสธต้องมีเหตุผล)
export function OfferActions({ offerId, dark = false }: { offerId: string; dark?: boolean }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send(path: string, body: unknown) {
    setBusy(true);
    const res = await fetch(`/api/offers/${offerId}/${path}`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    });
    const out = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setMsg(ERR[out?.error?.details?.reason] ?? ERR[out?.error?.code] ?? out?.error?.message_th ?? "ไม่สำเร็จ");
    if (path === "accept") router.push(`/liff/driver/jobs/${out.booking_id}`);
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="space-y-2">
        <select className={input} value={reason} onChange={(e) => setReason(e.target.value)}>
          <option value="">เหตุผลที่ปฏิเสธ…</option>
          <option value="ติดงานอื่น">ติดงานอื่น</option>
          <option value="ไกลเกินไป">ไกลเกินไป</option>
          <option value="ไม่สะดวกช่วงเวลานี้">ไม่สะดวกช่วงเวลานี้</option>
          <option value="รถไม่พร้อม">รถไม่พร้อม</option>
        </select>
        <div className="flex gap-2">
          <button className="flex-1 rounded-[var(--radius-btn)] bg-bad px-4 py-3 font-bold text-white disabled:opacity-50"
            disabled={!reason || busy} onClick={() => send("reject", { reason })}>ยืนยันปฏิเสธ</button>
          <button className={dark ? "flex-1 rounded-2xl border border-white/25 px-4 py-3 font-medium" : `${btnSecondary} flex-1`} onClick={() => setRejecting(false)}>กลับ</button>
        </div>
        {msg && <p className={"text-sm " + (dark ? "text-[#f3b8a8]" : "text-bad")}>{msg}</p>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {dark ? (
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <button className="h-[50px] rounded-2xl border border-white/25 font-medium" onClick={() => setRejecting(true)}>ปฏิเสธ</button>
          <button className="h-[50px] rounded-2xl bg-sand text-base font-bold text-forest disabled:opacity-50" disabled={busy} onClick={() => send("accept", {})}>รับงาน</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button className={`${btnPrimary} flex-1`} disabled={busy} onClick={() => send("accept", {})}>รับงาน</button>
          <button className={`${btnSecondary} flex-1`} onClick={() => setRejecting(true)}>ปฏิเสธ</button>
        </div>
      )}
      {msg && <p className={"text-sm " + (dark ? "text-[#f3b8a8]" : "text-bad")}>{msg}</p>}
    </div>
  );
}
