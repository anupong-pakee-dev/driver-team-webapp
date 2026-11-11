"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

// owner เพิ่มแอดมิน: กรอกชื่อ/อีเมล/สิทธิ์ → ได้ลิงก์ไปส่งทาง LINE · ผู้ได้รับเชิญตั้งรหัสผ่านเอง

export function StaffInviteForm() {
  const router = useRouter();
  const [link, setLink] = useState<{ link: string; hours: number } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/admin/staff/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ display_name: f.get("display_name"), email: f.get("email"), role: f.get("role") }),
    });
    setBusy(false);
    const json = await res.json().catch(() => null);
    if (!res.ok) return setError(json?.error?.code === "VALIDATION" ? "ตรวจชื่อและอีเมลอีกครั้ง" : json?.error?.message_th ?? "ไม่สำเร็จ");
    form.reset();
    setCopied(false);
    setLink({ link: json.link, hours: json.expires_in_hours });
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <form onSubmit={submit} className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto_auto]">
        <input name="display_name" required maxLength={60} placeholder="ชื่อที่แสดง" aria-label="ชื่อที่แสดง" className={input} />
        <input name="email" type="email" required maxLength={254} placeholder="อีเมลสำหรับเข้าสู่ระบบ" aria-label="อีเมล" className={input} />
        <select name="role" defaultValue="sales_admin" aria-label="สิทธิ์" className={input}>
          <option value="sales_admin">แอดมินขาย</option>
          <option value="owner">เจ้าของ (สิทธิ์เต็ม)</option>
        </select>
        <button disabled={busy} className={btnPrimary}>{busy ? "กำลังสร้าง…" : "สร้างลิงก์เชิญ"}</button>
      </form>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      {link && (
        <div className="space-y-2 rounded-xl bg-page p-3 text-sm">
          <p>ส่งลิงก์นี้ให้แอดมินคนใหม่ทาง LINE (ใช้ได้ครั้งเดียว ภายใน {link.hours} ชม.) — เขาจะตั้งรหัสผ่านเอง</p>
          <div className="flex gap-2">
            <input readOnly value={link.link} aria-label="ลิงก์เชิญ" className={`${input} py-2 font-mono text-xs`} onFocus={(e) => e.target.select()} />
            <button className={btnSecondary} onClick={async () => { await navigator.clipboard.writeText(link.link); setCopied(true); }}>
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function RevokeStaffInvite({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button
      className="text-xs text-bad underline"
      onClick={async () => {
        if (!window.confirm("ยกเลิกลิงก์เชิญนี้?")) return;
        await fetch(`/api/admin/staff/invite/${id}/revoke`, { method: "POST" });
        router.refresh();
      }}
    >
      ยกเลิกลิงก์
    </button>
  );
}
