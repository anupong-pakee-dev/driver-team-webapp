"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBaht } from "@/lib/money";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

const SLIP_TH: Record<string, string> = {
  AMOUNT_MISMATCH: "ยอดในสลิปน้อยกว่ายอดที่ต้องชำระ — ทีมงานจะตรวจสอบ",
  RECEIVER_MISMATCH: "บัญชีผู้รับไม่ตรงกับบัญชีบริษัท — ทีมงานจะตรวจสอบ",
  DUPLICATE: "สลิปนี้เคยใช้แล้ว — ทีมงานจะตรวจสอบ",
  TOO_OLD: "เวลาโอนไม่ตรงกับรายการนี้ — ทีมงานจะตรวจสอบ",
};

// adapter ข: ส่งรูปสลิป · local มีปุ่มจำลองสลิปที่ถูกต้อง (ไม่มีผู้ให้บริการตรวจสลิป)
export function SlipUpload({ paymentId, dev, amount, receiver }: { paymentId: string; dev: boolean; amount: number; receiver: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function done(res: Response) {
    const out = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) return setMsg(out?.error?.code === "RATE_LIMITED" ? "ส่งสลิปบ่อยเกินไป ลองใหม่ภายหลัง" : out?.error?.message_th ?? "ส่งไม่สำเร็จ");
    setMsg(out.status === "verified" ? "ชำระสำเร็จ ✓" : SLIP_TH[out.reason] ?? "ได้รับสลิปแล้ว รอเจ้าหน้าที่ตรวจ");
    router.refresh();
  }

  return (
    <div className="mt-4 space-y-2">
      <form
        className="space-y-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const file = new FormData(e.currentTarget).get("file");
          if (!(file instanceof File) || !file.size) return setMsg("เลือกรูปสลิปก่อน");
          const body = new FormData();
          body.set("file", file);
          setBusy(true);
          await done(await fetch(`/api/payments/${paymentId}/slip`, { method: "POST", body }));
        }}
      >
        <label className="block space-y-1">
          <span className="text-sm font-medium">โอนแล้ว? ส่งรูปสลิป</span>
          <input name="file" type="file" accept="image/jpeg,image/png,image/webp" className="block w-full text-sm" />
        </label>
        <button className={`${btnPrimary} w-full`} disabled={busy}>{busy ? "กำลังตรวจ…" : "ส่งสลิป"}</button>
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
          [local] จำลองสลิปที่ถูกต้อง
        </button>
      )}
      {msg && <p className="text-center text-sm text-navy">{msg}</p>}
    </div>
  );
}

export function OpenBalance({ bookingId, amount }: { bookingId: string; amount: number }) {
  const router = useRouter();
  return (
    <button
      className={`${btnPrimary} w-full`}
      onClick={async () => {
        await fetch(`/api/bookings/${bookingId}/balance`, { method: "POST" });
        router.refresh();
      }}
    >
      ชำระยอดคงเหลือ {formatBaht(amount)}
    </button>
  );
}

// FR-BOOK-06: แสดงยอดคืนก่อนยืนยัน
export function CancelBooking({ bookingId }: { bookingId: string }) {
  const router = useRouter();
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
        ขอยกเลิกการจอง
      </button>
    );
  }
  const RULE: Record<string, string> = { ">48h": "ยกเลิกก่อน 48 ชม.", "24-48h": "ยกเลิก 24–48 ชม. ก่อนเดินทาง", "<24h": "ยกเลิกน้อยกว่า 24 ชม." };
  return (
    <div className="space-y-3">
      <h3 className="font-bold">ยืนยันยกเลิก?</h3>
      <p className="text-sm">
        {RULE[preview.rule] ?? preview.rule} · ชำระแล้ว {formatBaht(preview.paid_satang)} ·{" "}
        <b>ได้คืน {formatBaht(preview.refund_satang)}</b>
      </p>
      <input className={input} placeholder="เหตุผล" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className="flex-1 rounded-[var(--radius-btn)] bg-bad px-4 py-3 font-bold text-white disabled:opacity-50" disabled={reason.trim().length < 2}
          onClick={async () => {
            const res = await fetch(`/api/bookings/${bookingId}/cancel`, {
              method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
              body: JSON.stringify({ reason }),
            });
            if (!res.ok) return setError("ยกเลิกไม่ได้ในสถานะนี้ — ติดต่อแอดมิน");
            router.refresh();
          }}>
          ยืนยันยกเลิก
        </button>
        <button className={`${btnSecondary} flex-1`} onClick={() => setPreview(null)}>ไม่ยกเลิก</button>
      </div>
    </div>
  );
}
