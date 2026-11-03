"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
      if (d?.reason === "TERMS_OUTDATED") return setError("เงื่อนไขมีการปรับปรุง กรุณาโหลดหน้าใหม่แล้วยอมรับอีกครั้ง");
      if (d?.field === "phone") return setError("เบอร์โทรไม่ถูกต้อง");
      return setError(out?.error?.message_th ?? "ยืนยันไม่สำเร็จ");
    }
    router.push(`/liff/customer/bookings/${out.booking_id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-[var(--radius-card)] border border-line bg-card p-4">
      <h2 className="font-bold">ยืนยันการจอง</h2>
      <p className="text-xs text-muted">ชื่อและเบอร์ใช้ให้คนขับติดต่อในวันเดินทางเท่านั้น (เปิดให้คนขับเห็น 2 ชม. ก่อนรับ)</p>
      <input name="full_name" required minLength={2} defaultValue={defaults.full_name} placeholder="ชื่อ-นามสกุลผู้เดินทาง" className={input} />
      <input name="phone" required inputMode="tel" defaultValue={defaults.phone} placeholder="เบอร์โทรวันเดินทาง" className={input} />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-navy" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          ฉันยอมรับ <Link href="/liff/customer/terms" className="text-navy underline" target="_blank">เงื่อนไขการใช้บริการและนโยบายยกเลิก</Link>{" "}
          และ <Link href="/liff/customer/terms#privacy" className="text-navy underline" target="_blank">ประกาศความเป็นส่วนตัว</Link>
        </span>
      </label>
      {driverOnly && (
        <label className="flex items-start gap-3 text-sm">
          <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 accent-navy" checked={liability} onChange={(e) => setLiability(e.target.checked)} />
          <span>ฉันรับทราบว่าบริการ &ldquo;คนขับอย่างเดียว&rdquo; ใช้รถของฉัน และยอมรับข้อตกลงความรับผิดเกี่ยวกับรถ</span>
        </label>
      )}
      <label className="flex items-start gap-3 text-sm text-muted">
        <input type="checkbox" name="marketing" className="mt-0.5 h-5 w-5 shrink-0 accent-navy" />
        <span>ยินยอมให้ใช้ข้อมูลการจองเพื่อวัดผลโฆษณา (ไม่บังคับ)</span>
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button className={`${btnPrimary} w-full`} disabled={!agree || (driverOnly && !liability) || busy}>
        {busy ? "กำลังสร้างรายการ…" : "ยืนยันและไปหน้าชำระมัดจำ"}
      </button>
    </form>
  );
}
