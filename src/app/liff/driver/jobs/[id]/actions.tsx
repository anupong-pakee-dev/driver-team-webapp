"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSage, btnSecondary, input } from "@/components/ui";

const STEP_TH = { depart: "ออกเดินทาง", arrive: "ถึงจุดรับแล้ว", pickup: "รับผู้โดยสารแล้ว", dropoff: "ส่งถึงที่หมายแล้ว" } as const;
const WARN_TH: Record<string, string> = {
  FAR_FROM_TARGET: "ตำแหน่งห่างจุดนัด — บันทึกไว้และแจ้งเจ้าของแล้ว",
  BALANCE_UNPAID: "ลูกค้ายังชำระยอดคงเหลือไม่ครบ — แจ้งเจ้าของแล้ว",
};

function getGps(): Promise<GeolocationPosition> {
  return new Promise((ok, fail) => {
    if (!navigator.geolocation) return fail(new Error("no geolocation"));
    navigator.geolocation.getCurrentPosition(ok, fail, { enableHighAccuracy: true, timeout: 20_000, maximumAge: 0 });
  });
}

// FR-TRIP-01/02: กดสถานะ + GPS (บังคับ) + รูป (บังคับตอนรับ/ส่ง)
export function TripStepButton({ bookingId, step, needsPhoto }: { bookingId: string; step: keyof typeof STEP_TH; needsPhoto: boolean }) {
  const router = useRouter();
  const [photo, setPhoto] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function go() {
    setMsg(null);
    if (needsPhoto && !photo) return setMsg("ถ่ายรูปก่อน");
    setBusy(true);
    let pos: GeolocationPosition;
    try {
      pos = await getGps();
    } catch {
      setBusy(false);
      return setMsg("เปิดตำแหน่ง (GPS) ก่อนกด — จำเป็นสำหรับบันทึกการเดินทาง");
    }
    const body = new FormData();
    body.set("to", step);
    body.set("lat", String(pos.coords.latitude));
    body.set("lng", String(pos.coords.longitude));
    body.set("accuracy_m", String(Math.round(pos.coords.accuracy)));
    if (photo) body.set("photo", photo);
    const res = await fetch(`/api/bookings/${bookingId}/status`, { method: "POST", body });
    const out = await res.json().catch(() => null);
    setBusy(false);
    if (!res.ok) {
      const rule = out?.error?.details?.rule;
      return setMsg(rule === "TOO_EARLY" ? "ยังเร็วเกินไป — กดออกเดินทางได้ 3 ชม. ก่อนเวลารับ"
        : rule === "BALANCE_UNPAID" ? "รอลูกค้าชำระยอดคงเหลือก่อนเริ่มงาน"
        : out?.error?.message_th ?? "บันทึกไม่สำเร็จ");
    }
    if (out.warning) alert(WARN_TH[out.warning] ?? out.warning);
    setPhoto(null);
    router.refresh();
  }

  return (
    <div className="space-y-2">
      {needsPhoto && (
        <label className="block space-y-1 rounded-[1.125rem] border border-line bg-card p-3 shadow-sm">
          <span className="text-sm font-medium">ถ่ายรูป{step === "pickup" ? "ตอนรับ" : "ตอนส่ง"} <span className="text-bad">*</span></span>
          <input type="file" accept="image/*" capture="environment" className="block w-full text-sm"
            onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
        </label>
      )}
      {msg && <p className="rounded-xl bg-card px-3 py-2 text-sm text-bad shadow-sm" role="alert">{msg}</p>}
      <button className={`${btnSage} h-16 w-full text-[1.1875rem]`} disabled={busy} onClick={go}>
        {busy ? "กำลังบันทึก…" : STEP_TH[step]}
        {!busy && <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>}
      </button>
      <p className="text-center text-[0.7rem] text-muted">บันทึก GPS อัตโนมัติเมื่อกด</p>
    </div>
  );
}

// FR-FRAUD-01 ขอชื่อ/เบอร์ลูกค้า (นอกช่วงเวลา → ระบบปฏิเสธ)
export function ContactButton({ bookingId }: { bookingId: string }) {
  const [c, setC] = useState<{ name: string | null; phone: string | null } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  if (c) {
    return (
      <div className="space-y-2">
        <p className="font-medium">{c.name}</p>
        {c.phone && <a href={`tel:${c.phone}`} className={`${btnPrimary} w-full`}>โทร {c.phone.replace(/^\+66/, "0")}</a>}
      </div>
    );
  }
  return (
    <div>
      <button className="w-full text-left" onClick={async () => {
        const res = await fetch(`/api/bookings/${bookingId}/contact`);
        if (res.ok) return setC(await res.json());
        const out = await res.json().catch(() => null);
        setMsg(out?.error?.details?.reason === "CONTACT_WINDOW" ? "ยังไม่ถึงช่วงเวลาที่เปิดดูได้" : out?.error?.message_th ?? "เปิดไม่ได้");
      }}>
        <span className="block text-sm font-semibold">ดูชื่อและเบอร์ลูกค้า</span>
        <span className="mt-0.5 block text-[0.7rem] text-muted">เปิดได้ 2 ชม. ก่อนรับ</span>
      </button>
      {msg && <p className="mt-2 text-sm text-bad">{msg}</p>}
    </div>
  );
}

// FR-TRIP-05 แจ้งเหตุการณ์ · ลูกค้าไม่มาต้องมีรูป
export function IncidentForm({ bookingId, canNoShow }: { bookingId: string; canNoShow: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  if (!open) return <button className="text-[0.8125rem] text-muted underline-offset-2 hover:underline" onClick={() => setOpen(true)}>แจ้งปัญหา / เหตุการณ์</button>;
  return (
    <form className="w-full space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      const body = new FormData(e.currentTarget);
      const photo = body.get("photo");
      if (photo instanceof File && !photo.size) body.delete("photo");
      const res = await fetch(`/api/bookings/${bookingId}/incidents`, { method: "POST", body });
      const out = await res.json().catch(() => null);
      if (!res.ok) return setMsg(out?.error?.details?.photo === "required" ? "กรณีลูกค้าไม่มา ต้องแนบรูป ณ จุดนัด" : out?.error?.message_th ?? "ส่งไม่สำเร็จ");
      setOpen(false);
      setMsg(null);
      alert("แจ้งเจ้าของแล้ว");
      router.refresh();
    }}>
      <select name="type" required className={input} defaultValue="">
        <option value="" disabled>ประเภท…</option>
        <option value="accident">อุบัติเหตุ</option>
        <option value="breakdown">รถเสีย</option>
        {canNoShow && <option value="no_show">ลูกค้าไม่มาตามนัด</option>}
        <option value="lost_item">ของหาย / ลืมของ</option>
        <option value="safety">ความปลอดภัย</option>
        <option value="other">อื่นๆ</option>
      </select>
      <textarea name="description" required minLength={3} rows={3} className={input} placeholder="เกิดอะไรขึ้น" />
      <textarea name="actions" rows={2} className={input} placeholder="ทำอะไรไปแล้ว (ถ้ามี)" />
      <input name="photo" type="file" accept="image/*" capture="environment" className="block w-full text-sm" />
      {msg && <p className="text-sm text-bad">{msg}</p>}
      <div className="flex gap-2">
        <button className={`${btnPrimary} flex-1`}>ส่ง</button>
        <button type="button" className={`${btnSecondary} flex-1`} onClick={() => setOpen(false)}>ยกเลิก</button>
      </div>
    </form>
  );
}

export function DriverCancel({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  if (!open) return <button className="text-[0.8125rem] text-muted underline-offset-2 hover:underline" onClick={() => setOpen(true)}>ยกเลิกงาน</button>;
  return (
    <div className="w-full space-y-2">
      <p className="text-sm text-muted">ระบบจะเสนองานให้คนอื่นทันที — ยกเลิกบ่อยมีผลต่อคะแนน</p>
      <input className={input} placeholder="เหตุผล" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="w-full rounded-[var(--radius-btn)] bg-bad px-4 py-3 font-bold text-white disabled:opacity-50" disabled={reason.trim().length < 3}
        onClick={async () => {
          await fetch(`/api/bookings/${bookingId}/driver-cancel`, {
            method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ reason }),
          });
          router.push("/liff/driver");
          router.refresh();
        }}>ยืนยันยกเลิกงาน</button>
    </div>
  );
}
