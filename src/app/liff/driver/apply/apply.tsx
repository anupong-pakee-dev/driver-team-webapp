"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { btnPrimary, input } from "@/components/ui";

type Status =
  | { status: "none" }
  | { status: "pending"; nickname: string; created_at: string }
  | { status: "rejected"; reason: string }
  | { status: "driver" };

const REASONS: Record<string, string> = {
  ALREADY_DRIVER: "บัญชี LINE นี้เป็นคนขับอยู่แล้ว — เปิดแอปคนขับได้เลย",
  LINE_ALREADY_USED: "บัญชี LINE นี้เคยใช้จองรถในฐานะลูกค้าแล้ว — ใช้ LINE อีกบัญชี หรือติดต่อเรา",
  PHONE_IN_USE: "เบอร์นี้เป็นคนขับในระบบแล้ว",
};

export function ApplyFlow({ liffId, dev, devLineId }: { liffId?: string; dev: boolean; devLineId: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fakeLine, setFakeLine] = useState(devLineId);

  const load = useCallback(async (idToken: string) => {
    setToken(idToken);
    const res = await fetch("/api/driver-applications/status", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id_token: idToken }),
    });
    if (!res.ok) return setError("ตรวจสอบบัญชี LINE ไม่สำเร็จ ลองเปิดลิงก์ใหม่");
    setState(await res.json());
  }, []);

  useEffect(() => {
    if (!liffId) return;
    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) return liff.login({ redirectUri: window.location.href });
        const idToken = liff.getIDToken();
        if (idToken) await load(idToken);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [liffId, load]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!token) return;
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    const res = await fetch("/api/driver-applications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({
        id_token: token, nickname: f.get("nickname"), full_name: f.get("full_name"), phone: f.get("phone"),
        consent: f.get("consent") === "on",
      }),
    });
    setBusy(false);
    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const d = body?.error?.details;
      return setError(REASONS[d?.reason] ?? (d?.field === "phone" ? "เบอร์โทรไม่ถูกต้อง"
        : body?.error?.code === "RATE_LIMITED" ? "ส่งบ่อยเกินไป รอสักครู่แล้วลองใหม่" : "ส่งใบสมัครไม่สำเร็จ ตรวจข้อมูลอีกครั้ง"));
    }
    setState(body);
  }

  if (error && !state) return <p className="text-center text-bad">{error}</p>;

  if (!token) {
    if (liffId) return <p className="text-center text-muted">กำลังเข้าสู่ระบบด้วย LINE…</p>;
    if (!dev) return <p className="text-center text-muted">ยังไม่ได้ตั้งค่า LIFF</p>;
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted">โหมดทดสอบ (local): จำลอง LINE user ID</p>
        <input className={input} value={fakeLine} onChange={(e) => setFakeLine(e.target.value)} aria-label="LINE user ID สมมติ" />
        <button className={`${btnPrimary} w-full`} disabled={!fakeLine} onClick={() => load(`dev:${fakeLine}`)}>ต่อไป</button>
      </div>
    );
  }

  if (!state) return <p className="text-center text-muted">กำลังตรวจสอบ…</p>;

  if (state.status === "driver") {
    return (
      <div className="space-y-4 text-center">
        <p className="text-lg font-semibold">คุณเป็นคนขับของเราแล้ว ✓</p>
        <p className="text-sm text-muted">เปิดแอปคนขับเพื่อยอมรับข้อตกลง ส่งเอกสาร และรับงาน</p>
        <Link href="/liff/driver" className={`${btnPrimary} w-full`}>เปิดแอปคนขับ</Link>
      </div>
    );
  }

  if (state.status === "pending") {
    return (
      <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-card p-5 text-center">
        <p className="text-lg font-semibold">ส่งใบสมัครแล้ว ✓</p>
        <p className="text-sm text-muted">คุณ{state.nickname} · รอเจ้าของตรวจและอนุมัติ</p>
        <p className="text-sm text-muted">เปิดลิงก์หรือสแกน QR นี้อีกครั้งเพื่อดูผล เมื่ออนุมัติแล้วจะมีปุ่มเข้าแอปคนขับ</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {state.status === "rejected" && (
        <p className="rounded-xl bg-bad/10 px-3.5 py-2.5 text-sm text-bad">ใบสมัครครั้งก่อนไม่ผ่าน: {state.reason} — แก้ไขแล้วสมัครใหม่ได้</p>
      )}
      <div className="space-y-1.5 text-sm text-muted">
        <p>สิ่งที่ต้องมีเพื่อรับงาน: ใบอนุญาตขับรถสาธารณะ และรถที่จดทะเบียนประเภทรับจ้างหรือให้เช่า พร้อม พ.ร.บ. และประกันภาคสมัครใจ</p>
        <p>หลังอนุมัติ คุณจะส่งเอกสารในแอปคนขับ</p>
      </div>
      <label className="block space-y-1">
        <span className="text-sm font-medium">ชื่อเล่น (ลูกค้าเห็น)</span>
        <input name="nickname" required maxLength={50} className={input} autoComplete="nickname" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">ชื่อ-นามสกุล</span>
        <input name="full_name" required minLength={2} maxLength={120} className={input} autoComplete="name" />
      </label>
      <label className="block space-y-1">
        <span className="text-sm font-medium">เบอร์โทร</span>
        <input name="phone" required inputMode="tel" maxLength={20} className={input} autoComplete="tel" />
      </label>
      <label className="flex items-start gap-2.5 text-sm">
        <input type="checkbox" name="consent" required className="mt-1 h-4 w-4" />
        <span>ยินยอมให้เก็บชื่อ เบอร์โทร และ LINE เพื่อพิจารณาการสมัคร ตาม <Link href="/privacy" className="text-sage underline" target="_blank">ประกาศความเป็นส่วนตัว</Link></span>
      </label>
      {error && <p className="text-sm text-bad" role="alert">{error}</p>}
      <button disabled={busy} className={`${btnPrimary} w-full`}>{busy ? "กำลังส่ง…" : "ส่งใบสมัคร"}</button>
    </form>
  );
}
