"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

// FR-TRIP-03 ยืนยันจบงาน + คะแนน · FR-TRIP-04 ร้องเรียน
export function CompleteTrip({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-1" role="radiogroup" aria-label="ให้คะแนน">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} ดาว`}
            className={"text-4xl " + (n <= rating ? "text-amber" : "text-line")} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <textarea className={input} rows={2} placeholder="ความเห็นถึงคนขับ (ไม่บังคับ)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-navy" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        ยินยอมให้นำรีวิวนี้ไปใช้ในการประชาสัมพันธ์ (ไม่บังคับ)
      </label>
      <button className={`${btnPrimary} w-full`} disabled={busy} onClick={async () => {
        setBusy(true);
        await fetch(`/api/bookings/${bookingId}/complete`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ rating, comment: comment || null, consent_marketing: consent }),
        });
        router.refresh();
      }}>ยืนยันจบงาน</button>
    </div>
  );
}

export function Complain({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <button className="w-full text-sm text-bad underline" onClick={() => setOpen(true)}>แจ้งปัญหา / ร้องเรียน</button>;
  return (
    <div className="space-y-2">
      <textarea className={input} rows={3} placeholder="เล่าปัญหาที่พบ" value={text} onChange={(e) => setText(e.target.value)} />
      {msg && <p className="text-sm text-bad">{msg}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-[var(--radius-btn)] bg-bad px-4 py-3 font-bold text-white disabled:opacity-50" disabled={text.trim().length < 5}
          onClick={async () => {
            const res = await fetch(`/api/bookings/${bookingId}/complaints`, {
              method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: text }),
            });
            if (!res.ok) return setMsg("ส่งไม่ได้ — เกิน 24 ชม. หลังจบงาน กรุณาทักแชท LINE");
            setOpen(false);
            alert("ได้รับเรื่องแล้ว ทีมงานจะติดต่อกลับ");
            router.refresh();
          }}>ส่งเรื่อง</button>
        <button className={`${btnSecondary} flex-1`} onClick={() => setOpen(false)}>ยกเลิก</button>
      </div>
    </div>
  );
}
