"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBaht } from "@/lib/money";
import { btnPrimary, input } from "@/components/ui";

// FR-PAY-03: sales_admin ขออนุมัติ (ยืนยันเองไม่ได้) · owner อนุมัติ/ไม่อนุมัติ
export function PaymentDecision({ paymentId, isOwner }: { paymentId: string; isOwner: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const send = async (approve?: boolean) => {
    const res = await fetch(`/api/admin/payments/${paymentId}/approve`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(approve === undefined ? { reason } : { approve, reason }),
    });
    const out = await res.json().catch(() => null);
    if (!res.ok) return setMsg(out?.error?.message_th ?? "ไม่สำเร็จ");
    router.refresh();
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input className={`${input} max-w-xs py-2`} placeholder={isOwner ? "เหตุผล / หลักฐานที่ตรวจ" : "ตรวจอะไรแล้วบ้าง"} value={reason}
        onChange={(e) => setReason(e.target.value)} />
      {isOwner ? (
        <>
          <button className="rounded-lg bg-ok px-3 py-2 font-semibold text-white disabled:opacity-50" disabled={reason.trim().length < 3} onClick={() => send(true)}>
            ยืนยันรับเงิน
          </button>
          <button className="rounded-lg border border-line px-3 py-2 disabled:opacity-50" disabled={reason.trim().length < 3} onClick={() => send(false)}>
            ไม่อนุมัติ
          </button>
        </>
      ) : (
        <button className="rounded-lg bg-navy px-3 py-2 font-semibold text-white disabled:opacity-50" disabled={reason.trim().length < 3} onClick={() => send()}>
          ส่งให้เจ้าของอนุมัติ
        </button>
      )}
      {msg && <span className="text-bad">{msg}</span>}
    </div>
  );
}

export function RefundPaid({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="flex flex-wrap items-center gap-2" onSubmit={async (e) => {
      e.preventDefault();
      const file = new FormData(e.currentTarget).get("file");
      if (!(file instanceof File) || !file.size) return setMsg("แนบหลักฐานการโอน");
      const body = new FormData();
      body.set("file", file);
      const res = await fetch(`/api/admin/payments/${paymentId}/refund-paid`, { method: "POST", body });
      if (!res.ok) return setMsg("บันทึกไม่สำเร็จ");
      router.refresh();
    }}>
      <input name="file" type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="text-sm" />
      <button className="rounded-lg bg-navy px-3 py-2 font-semibold text-white">โอนคืนแล้ว</button>
      {msg && <span className="text-bad">{msg}</span>}
    </form>
  );
}

export function CompanyCancel({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [by, setBy] = useState<"company" | "flight_cancelled">("company");
  const [reason, setReason] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  const [key] = useState(() => crypto.randomUUID());
  return (
    <div className="space-y-2 text-sm">
      <select className={input} value={by} onChange={(e) => { setBy(e.target.value as typeof by); setPreview(null); }}>
        <option value="company">บริษัทจัดรถไม่ได้</option>
        <option value="flight_cancelled">เที่ยวบินยกเลิก (มีหลักฐาน)</option>
      </select>
      <input className={input} placeholder="เหตุผล" value={reason} onChange={(e) => setReason(e.target.value)} />
      {preview === null ? (
        <button className="w-full rounded-lg border border-line py-2" onClick={async () => {
          const r = await fetch(`/api/bookings/${bookingId}/cancellation-preview?by=${by}`);
          if (r.ok) setPreview((await r.json()).refund_satang);
        }}>ดูยอดคืน</button>
      ) : (
        <button className={`${btnPrimary} w-full`} disabled={reason.trim().length < 3} onClick={async () => {
          await fetch(`/api/bookings/${bookingId}/cancel`, {
            method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
            body: JSON.stringify({ by, reason }),
          });
          router.refresh();
        }}>ยืนยันยกเลิก · คืน {formatBaht(preview)}</button>
      )}
    </div>
  );
}

// FR-ADS-03 แท็กที่มาด้วยมือ (ลูกค้าทักตรง)
export function SourceTag({ bookingId, platform, campaignId, campaigns }: {
  bookingId: string; platform: string; campaignId: string | null; campaigns: { id: string; name: string; platform: string }[];
}) {
  const router = useRouter();
  const [p, setP] = useState(platform);
  const [c, setC] = useState(campaignId ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2 text-sm">
      <select className={input} value={c} onChange={(e) => { setC(e.target.value); const k = campaigns.find((x) => x.id === e.target.value); if (k) setP(k.platform); }}>
        <option value="">ไม่มีแคมเปญ</option>
        {campaigns.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}
      </select>
      <select className={input} value={p} onChange={(e) => setP(e.target.value)}>
        {["meta", "google", "tiktok", "gbp", "offline", "referral", "direct", "unknown"].map((v) => <option key={v} value={v}>{v}</option>)}
      </select>
      <button className="w-full rounded-lg border border-line py-2" onClick={async () => {
        const res = await fetch(`/api/admin/bookings/${bookingId}/source`, {
          method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ source_platform: p, campaign_id: c || null }),
        });
        setMsg(res.ok ? "บันทึกแล้ว" : "ไม่สำเร็จ");
        router.refresh();
      }}>บันทึกที่มา</button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}
