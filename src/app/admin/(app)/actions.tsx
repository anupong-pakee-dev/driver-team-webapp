"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

// ปุ่ม/ฟอร์มเล็กๆ ของหลังบ้านที่เรียก API แล้ว refresh หน้า

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => null);
  return { ok: res.ok, json };
}

export function ReviewButtons({ docId }: { docId: string }) {
  const router = useRouter();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function review(approve: boolean) {
    setBusy(true);
    const r = await call(`/api/admin/documents/${docId}/review`, "POST", approve ? { approve } : { approve, reason });
    setBusy(false);
    if (!r.ok) return setError(r.json?.error?.message_th ?? "ไม่สำเร็จ");
    router.refresh();
  }

  if (rejecting) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${input} max-w-xs py-2`} placeholder="เหตุผลที่ไม่ผ่าน" value={reason} onChange={(e) => setReason(e.target.value)} />
        <button className="rounded-lg bg-bad px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy || reason.trim().length < 3} onClick={() => review(false)}>
          ยืนยันไม่ผ่าน
        </button>
        <button className="text-sm text-muted" onClick={() => setRejecting(false)}>ยกเลิก</button>
        {error && <span className="text-sm text-bad">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <button className="rounded-lg bg-ok px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={busy} onClick={() => review(true)}>
        อนุมัติ
      </button>
      <button className="rounded-lg border border-line px-3 py-2 text-sm" onClick={() => setRejecting(true)}>ไม่ผ่าน</button>
      {error && <span className="text-sm text-bad">{error}</span>}
    </div>
  );
}

function CopyLink({ link, hours }: { link: string; hours: number }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-2 rounded-xl bg-page p-3 text-sm">
      <p>ส่งลิงก์นี้ให้คนขับทาง LINE (ใช้ได้ครั้งเดียว ภายใน {hours} ชม.)</p>
      <div className="flex gap-2">
        <input readOnly value={link} className={`${input} py-2 font-mono text-xs`} onFocus={(e) => e.target.select()} />
        <button className={btnSecondary} onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); }}>
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
      </div>
    </div>
  );
}

export function InviteForm() {
  const router = useRouter();
  const [link, setLink] = useState<{ link: string; hours: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const form = e.currentTarget;
    const f = new FormData(form);
    const r = await call("/api/admin/drivers/invite", "POST", {
      nickname: f.get("nickname"), full_name: f.get("full_name"), phone: f.get("phone"),
    });
    if (!r.ok) {
      const d = r.json?.error?.details;
      return setError(d?.field === "phone" ? (d?.problem === "duplicate" ? "เบอร์นี้เป็นคนขับในระบบแล้ว" : "เบอร์โทรไม่ถูกต้อง") : r.json?.error?.message_th ?? "ไม่สำเร็จ");
    }
    form.reset();
    setLink({ link: r.json.link, hours: r.json.expires_in_hours });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-4">
        <input name="nickname" required placeholder="ชื่อเล่น" className={input} />
        <input name="full_name" required placeholder="ชื่อ-นามสกุล" className={input} />
        <input name="phone" required placeholder="เบอร์โทร" inputMode="tel" className={input} />
        <button className={btnPrimary}>สร้างลิงก์เชิญ</button>
      </form>
      {error && <p className="text-sm text-bad">{error}</p>}
      {link && <CopyLink link={link.link} hours={link.hours} />}
    </div>
  );
}

export function ReissueInvite({ driverId }: { driverId: string }) {
  const [link, setLink] = useState<{ link: string; hours: number } | null>(null);
  if (link) return <CopyLink link={link.link} hours={link.hours} />;
  return (
    <button
      className={btnSecondary}
      onClick={async () => {
        const r = await call(`/api/admin/drivers/${driverId}/invite`, "POST");
        if (r.ok) setLink({ link: r.json.link, hours: r.json.expires_in_hours });
      }}
    >
      ออกลิงก์เชิญใหม่
    </button>
  );
}

export function BackgroundCheckForm({ driverId }: { driverId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const r = await call(`/api/admin/drivers/${driverId}/background-check`, "POST", {
          at: f.get("at"), passed: f.get("passed") === "yes",
        });
        if (!r.ok) return setError("บันทึกไม่สำเร็จ");
        router.refresh();
      }}
    >
      <label className="space-y-1">
        <span className="block text-xs text-muted">วันที่ตรวจ</span>
        <input type="date" name="at" required className={`${input} py-2`} />
      </label>
      <label className="space-y-1">
        <span className="block text-xs text-muted">ผล</span>
        <select name="passed" className={`${input} py-2`} defaultValue="yes">
          <option value="yes">ผ่าน</option>
          <option value="no">ไม่ผ่าน</option>
        </select>
      </label>
      <button className={btnSecondary}>บันทึกผล</button>
      {error && <span className="text-sm text-bad">{error}</span>}
    </form>
  );
}

export function VehicleActiveToggle({ id, active }: { id: string; active: boolean }) {
  const router = useRouter();
  return (
    <button
      className="text-sm text-muted underline"
      onClick={async () => {
        const reason = window.prompt(active ? "เหตุผลที่ปิดใช้งานรถคันนี้" : "เหตุผลที่เปิดใช้งาน");
        if (!reason || reason.trim().length < 3) return;
        await call(`/api/admin/vehicles/${id}/active`, "POST", { active: !active, reason });
        router.refresh();
      }}
    >
      {active ? "ปิดใช้งานรถ" : "เปิดใช้งานรถ"}
    </button>
  );
}
