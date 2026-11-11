"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

// FR-TRIP-03 ยืนยันจบงาน + คะแนน · FR-TRIP-04 ร้องเรียน
export function CompleteTrip({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const tr = t.trip;
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex justify-center gap-1" role="radiogroup" aria-label={tr.rate}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={tr.star(n)}
            className={"text-4xl " + (n <= rating ? "text-[#c9973f]" : "text-line")} onClick={() => setRating(n)}>★</button>
        ))}
      </div>
      <textarea className={input} rows={2} placeholder={tr.commentPh} value={comment} onChange={(e) => setComment(e.target.value)} />
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-sage" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        {tr.reviewConsent}
      </label>
      <button className={`${btnPrimary} w-full`} disabled={busy} onClick={async () => {
        setBusy(true);
        await fetch(`/api/bookings/${bookingId}/complete`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ rating, comment: comment || null, consent_marketing: consent }),
        });
        router.refresh();
      }}>{tr.complete}</button>
    </div>
  );
}

export function Complain({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const tr = t.trip;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <button className="w-full text-sm text-bad underline" onClick={() => setOpen(true)}>{tr.complain}</button>;
  return (
    <div className="space-y-2">
      <textarea className={input} rows={3} placeholder={tr.complainPh} value={text} onChange={(e) => setText(e.target.value)} />
      {msg && <p className="text-sm text-bad">{msg}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-[var(--radius-btn)] bg-bad px-4 py-3 font-bold text-white disabled:opacity-50" disabled={text.trim().length < 5}
          onClick={async () => {
            const res = await fetch(`/api/bookings/${bookingId}/complaints`, {
              method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ description: text }),
            });
            if (!res.ok) return setMsg(tr.tooLate);
            setOpen(false);
            alert(tr.received);
            router.refresh();
          }}>{tr.send}</button>
        <button className={`${btnSecondary} flex-1`} onClick={() => setOpen(false)}>{t.common.cancel}</button>
      </div>
    </div>
  );
}
