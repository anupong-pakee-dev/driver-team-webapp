"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, input } from "@/components/ui";

const REASONS: Record<string, string> = {
  INVITE_INVALID: "ลิงก์เชิญไม่ถูกต้อง",
  INVITE_USED: "ลิงก์นี้ถูกใช้ไปแล้ว",
  INVITE_EXPIRED: "ลิงก์หมดอายุ — ขอลิงก์ใหม่จากเจ้าของ",
  EMAIL_EXISTS: "อีเมลนี้มีบัญชีอยู่แล้ว — ให้เจ้าของเชิญด้วยอีเมลอื่น",
  WEAK_PASSWORD: "รหัสผ่านเดาง่ายเกินไป ลองตั้งใหม่",
};

export function JoinForm({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const password = String(f.get("password") ?? "");
    if (password !== f.get("confirm")) return setError("รหัสผ่านทั้งสองช่องไม่ตรงกัน");
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/admin/join", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password }),
    });
    if (res.ok) {
      router.push("/admin");
      router.refresh();
      return;
    }
    setBusy(false);
    const body = await res.json().catch(() => null);
    const reason = body?.error?.details?.reason;
    setError(REASONS[reason] ?? (body?.error?.code === "RATE_LIMITED" ? "ลองบ่อยเกินไป รอสักครู่" : body?.error?.message_th ?? "ไม่สำเร็จ"));
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {/* ให้ตัวจัดการรหัสผ่านจำคู่ อีเมล + รหัสผ่าน */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <label className="block space-y-1">
        <span className="text-sm font-medium">ตั้งรหัสผ่าน (อย่างน้อย 10 ตัว)</span>
        <input name="password" type="password" autoComplete="new-password" required minLength={10} maxLength={200} className={input} />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">ยืนยันรหัสผ่าน</span>
        <input name="confirm" type="password" autoComplete="new-password" required minLength={10} maxLength={200} className={input} />
      </label>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <button disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? "กำลังสร้างบัญชี…" : "ตั้งรหัสผ่านและเข้าสู่ระบบ"}
      </button>
    </form>
  );
}
