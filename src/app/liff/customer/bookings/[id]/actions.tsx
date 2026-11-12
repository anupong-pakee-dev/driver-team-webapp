"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorText } from "@/i18n/core";
import { formatBaht } from "@/lib/money";
import { useI18n } from "@/components/i18nContext";
import { btnPrimary, btnSage, btnSecondary, input } from "@/components/ui";

// adapter ข: ส่งรูปสลิป · local มีปุ่มจำลองสลิปที่ถูกต้อง (ไม่มีผู้ให้บริการตรวจสลิป)
export function SlipUpload({ paymentId, dev, amount, receiver }: { paymentId: string; dev: boolean; amount: number; receiver: string }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const sl = t.slip;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function done(res: Response) {
    const out = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setMsg(out?.error?.code === "RATE_LIMITED" ? sl.tooOften : apiErrorText(out, locale) ?? sl.failed);
    setMsg(out.status === "verified" ? sl.success : (out.reason !== "MANUAL_REVIEW" && t.slipReason[out.reason]) || sl.received);
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-2">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get("file");
          if (!(file instanceof File) || !file.size) return setMsg(sl.chooseFirst);
          const body = new FormData();
          body.set("file", file);
          setBusy(true);
          await done(await fetch(`/api/payments/${paymentId}/slip`, { method: "POST", body }));
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">{sl.label}</span>
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
        </label>
        <button className={`${btnSage} w-full py-3.5 text-base shadow-none`} disabled={busy}>{busy ? sl.checking : sl.send}</button>
      </form>
      {dev && (
        <button
          type="button"
          className="w-full rounded-lg border border-dashed border-line py-2 text-xs text-muted"
          onClick={async () => {
            setBusy(true);
            const payload = `DEVSLIP|DEV${Date.now()}|${amount}|${receiver}|${new Date().toISOString()}`;
            await done(await fetch(`/api/payments/${paymentId}/slip`, {
              method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ qr_payload: payload }),
            }));
          }}
        >
          {sl.dev}
        </button>
      )}
      {msg && <p className="text-center text-sm text-navy">{msg}</p>}
    </div>
  );
}

export function OpenBalance({ bookingId, amount }: { bookingId: string; amount: number }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button
      className={`${btnPrimary} w-full`}
      onClick={async () => {
        await fetch(`/api/bookings/${bookingId}/balance`, { method: "POST" });
        router.refresh();
      }}
    >
      {t.balance.pay(formatBaht(amount))}
    </button>
  );
}

// FR-BOOK-06: แสดงยอดคืนก่อนยืนยัน
export function CancelBooking({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const { t } = useI18n();
  const c = t.cancel;
  const [preview, setPreview] = useState<{ refund_satang: number; paid_satang: number; rule: string } | null>(null);
  const [reason, setReason] = useState("");
  const [key] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<string | null>(null);

  if (!preview) {
    return (
      <button className="w-full text-sm text-bad underline" onClick={async () => {
        const res = await fetch(`/api/bookings/${bookingId}/cancellation-preview`);
        if (res.ok) setPreview(await res.json());
      }}>
        {c.ask}
      </button>
    );
  }
  return (
    <div className="space-y-3">
      <h3 className="font-bold">{c.confirmTitle}</h3>
      <p className="text-sm">
        {t.cancelRule[preview.rule] ?? preview.rule} · {c.paid(formatBaht(preview.paid_satang))} ·{" "}
        <b>{c.refund(formatBaht(preview.refund_satang))}</b>
      </p>
      <input className={input} placeholder={c.reasonPh} value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-[var(--radius-btn)] bg-bad px-4 py-3 font-bold text-white disabled:opacity-50" disabled={reason.trim().length < 2}
          onClick={async () => {
            const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
              method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
              body: JSON.stringify({ reason }),
            });
            if (!res.ok) return setError(c.notAllowed);
            router.refresh();
          }}>
          {c.confirm}
        </button>
        <button className={`${btnSecondary} flex-1`} onClick={() => setPreview(null)}>{c.keep}</button>
      </div>
    </div>
  );
}
