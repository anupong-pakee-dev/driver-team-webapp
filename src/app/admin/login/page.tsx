"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, input } from "@/components/ui";

export default function AdminLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/admin", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: f.get("email"), password: f.get("password") }),
    });
    setBusy(false);
    if (res.ok) {
      router.push("/admin");
      router.refresh();
    } else {
      const body = await res.json().catch(() => null);
      setError(body?.error?.code === "FORBIDDEN" ? "บัญชีนี้ไม่มีสิทธิ์เข้าหลังบ้าน" : "อีเมลหรือรหัสผ่านไม่ถูกต้อง");
    }
  }

  return (
    <div className="grid flex-1 place-items-center bg-navy px-5 py-10">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-[var(--radius-card)] bg-card p-6 shadow-lg">
        <div>
          <h1 className="text-2xl font-bold">หลังบ้าน</h1>
          <p className="text-sm text-muted">สำหรับแอดมินและเจ้าของ</p>
        </div>
        <label className="block space-y-1">
          <span className="text-sm font-medium">อีเมล</span>
          <input name="email" type="email" autoComplete="username" required className={input} />
        </label>
        <label className="block space-y-1">
          <span className="text-sm font-medium">รหัสผ่าน</span>
          <input name="password" type="password" autoComplete="current-password" required minLength={8} className={input} />
        </label>
        {error && <p className="text-sm text-bad">{error}</p>}
        <button disabled={busy} className={`${btnPrimary} w-full`}>
          {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
        </button>
      </form>
    </div>
  );
}
