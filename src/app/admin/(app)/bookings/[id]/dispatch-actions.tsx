"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REASON_TH } from "@/domain/documents";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: "POST", headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined,
  });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

export function Redispatch({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <button className={btnSecondary} onClick={async () => {
        const r = await post(`/api/admin/bookings/${bookingId}/redispatch`);
        setMsg(r.json?.offered ? "ส่งข้อเสนอแล้ว" : "ไม่มีคนขับที่รับได้ — ใช้การเลือกคนขับเอง");
        router.refresh();
      }}>เสนองานอีกรอบ</button>
      {msg && <p className="text-xs text-muted">{msg}</p>}
    </div>
  );
}

// FR-DISP-03: owner เลือกคนขับเอง — เหตุผลบังคับ · รายชื่อมีเฉพาะคนที่ผ่านเกณฑ์และว่าง
export function OverrideAssign({ bookingId, candidates }: { bookingId: string; candidates: { driverId: string; vehicleId: string | null; label: string }[] }) {
  const router = useRouter();
  const [pick, setPick] = useState(0);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div className="space-y-2 text-sm">
      <div className="font-medium">เลือกคนขับเอง (override)</div>
      <select className={input} value={pick} onChange={(e) => setPick(Number(e.target.value))}>
        {candidates.map((c, i) => <option key={`${c.driverId}-${c.vehicleId}`} value={i}>{c.label}</option>)}
      </select>
      <input className={input} placeholder="เหตุผล (บังคับ)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {msg && <p className="text-bad">{msg}</p>}
      <button className={`${btnPrimary} w-full`} disabled={reason.trim().length < 3} onClick={async () => {
        const c = candidates[pick];
        const r = await post(`/api/admin/bookings/${bookingId}/override-assign`, { driver_id: c.driverId, vehicle_id: c.vehicleId, reason });
        if (!r.ok) return setMsg((r.json?.error?.details?.reasons as string[] | undefined)?.map((x) => REASON_TH[x] ?? x).join(", ") ?? r.json?.error?.message_th ?? "ไม่สำเร็จ");
        router.refresh();
      }}>มอบหมายงาน</button>
    </div>
  );
}

export function NoShowConfirm({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const RULE: Record<string, string> = {
    FREE_WAIT_NOT_OVER: "ยังไม่เลยเวลารอฟรี",
    NO_SHOW_REPORT_WITH_PHOTO_REQUIRED: "ต้องมีรายงานจากคนขับพร้อมรูป",
  };
  return (
    <div className="space-y-2 text-sm">
      <input className={input} placeholder="สรุปการตรวจ (เช่น โทรหาลูกค้าไม่ติด 3 ครั้ง)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {msg && <p className="text-bad">{msg}</p>}
      <button className="w-full rounded-lg bg-bad px-3 py-2 font-semibold text-white disabled:opacity-50" disabled={reason.trim().length < 3}
        onClick={async () => {
          const r = await post(`/api/admin/bookings/${bookingId}/no-show`, { reason });
          if (!r.ok) return setMsg(RULE[r.json?.error?.details?.rule] ?? r.json?.error?.message_th ?? "ไม่สำเร็จ");
          router.refresh();
        }}>ยืนยันลูกค้าไม่มา (no-show)</button>
    </div>
  );
}

export function ResolveDispute({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  return (
    <div className="space-y-2 text-sm">
      <textarea className={input} rows={2} placeholder="ผลการแก้ไขข้อร้องเรียน" value={text} onChange={(e) => setText(e.target.value)} />
      <button className={`${btnPrimary} w-full`} disabled={text.trim().length < 3} onClick={async () => {
        await post(`/api/admin/bookings/${bookingId}/resolve`, { resolution: text });
        router.refresh();
      }}>ปิดเรื่อง → จบงาน</button>
    </div>
  );
}
