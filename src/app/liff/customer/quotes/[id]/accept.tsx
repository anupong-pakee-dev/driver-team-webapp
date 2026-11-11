"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiErrorText } from "@/i18n";
import { useI18n } from "@/components/I18nProvider";
import { btnPrimary, input } from "@/components/ui";

// FR-BOOK-03: ยอมรับ Terms + Privacy (version ล่าสุด) → FR-PAY-01 สร้าง booking + QR มัดจำ
export function AcceptQuote({
  quoteId, terms, driverOnly, idempotencyKey, defaults,
}: {
  quoteId: string;
  terms: { terms_version: string; privacy_version: string };
  driverOnly: boolean;
  idempotencyKey: string;
  defaults: { full_name: string; phone: string };
}) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const a = t.accept;
  const [agree, setAgree] = useState(false);
  const [liability, setLiability] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/quotes/${quoteId}/accept`, {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({
        ...terms,
        marketing_tracking: f.get("marketing") === "on",
        ...(driverOnly ? { vehicle_liability: liability } : {}),
        full_name: f.get("full_name"),
        phone: f.get("phone"),
      }),
    });
    const out = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const d = out?.error?.details;
      if (d?.reason === "ALREADY_ACCEPTED") return router.push(`/liff/customer/bookings/${d.booking_id}`);
      if (d?.reason === "TERMS_OUTDATED") return setError(a.termsOutdated);
      if (d?.field === "phone") return setError(a.badPhone);
      return setError(apiErrorText(out, locale) ?? a.failed);
    }
    router.push(`/liff/customer/bookings/${out.booking_id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-card p-4">
      <h2 className="font-bold">{a.title}</h2>
      <p className="text-xs text-muted">{a.contactNote}</p>
      <input name="full_name" required minLength={2} defaultValue={defaults.full_name} placeholder={a.namePh} className={input} />
      <input name="phone" required inputMode="tel" defaultValue={defaults.phone} placeholder={a.phonePh} className={input} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-sage" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          {a.agree} <Link href="/liff/customer/terms" className="text-sage underline" target="_blank">{a.termsLink}</Link>{" "}
          {a.and} <Link href="/liff/customer/terms#privacy" className="text-sage underline" target="_blank">{a.privacyLink}</Link>
        </span>
      </label>
      {driverOnly && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-sage" checked={liability} onChange={(e) => setLiability(e.target.checked)} />
          <span>{a.liability}</span>
        </label>
      )}
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="marketing" className="mt-0.5 h-5 w-5 shrink-0 accent-sage" />
        <span>{a.marketing}</span>
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className={`${btnPrimary} w-full`} disabled={!agree || (driverOnly && !liability) || busy}>
        {busy ? a.submitting : a.submit}
      </button>
    </form>
  );
}
