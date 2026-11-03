"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { btnPrimary, input } from "@/components/ui";

const REASONS: Record<string, string> = {
  INVITE_INVALID: "ลิงก์เชิญไม่ถูกต้อง",
  INVITE_USED: "ลิงก์นี้ถูกใช้ไปแล้ว",
  INVITE_EXPIRED: "ลิงก์หมดอายุ — ขอลิงก์ใหม่จากเจ้าของ",
  LINE_ALREADY_USED: "บัญชี LINE นี้ผูกกับผู้ใช้อื่นแล้ว",
};

export function JoinWithInvite({ token, liffId, dev, devLineId }: { token: string; liffId?: string; dev: boolean; devLineId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [fakeLine, setFakeLine] = useState(devLineId);

  const redeem = useCallback(async (idToken: string) => {
    const res = await fetch("/api/auth/liff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id_token: idToken, app: "driver", invite_token: token }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      const reason = body?.error?.details?.reason;
      return setError(REASONS[reason] ?? body?.error?.message_th ?? "เข้าร่วมไม่สำเร็จ");
    }
    router.push("/liff/driver/terms");
    router.refresh();
  }, [router, token]);

  useEffect(() => {
    if (!liffId || !token) return;
    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) return liff.login({ redirectUri: window.location.href });
        const idToken = liff.getIDToken();
        if (idToken) await redeem(idToken);
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [liffId, token, redeem]);

  if (!token) return <p className="text-center text-bad">ไม่พบรหัสคำเชิญในลิงก์</p>;
  if (error) return <p className="text-center text-bad">{error}</p>;
  if (liffId) return <p className="text-center text-muted">กำลังเข้าสู่ระบบด้วย LINE…</p>;
  if (!dev) return <p className="text-center text-muted">ยังไม่ได้ตั้งค่า LIFF</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">โหมดทดสอบ (local): จำลองการ login LINE ด้วย LINE user ID สมมติ</p>
      <input className={input} value={fakeLine} onChange={(e) => setFakeLine(e.target.value)} aria-label="LINE user ID สมมติ" />
      <button className={`${btnPrimary} w-full`} disabled={!fakeLine} onClick={() => redeem(`dev:${fakeLine}`)}>
        เข้าร่วมทีม
      </button>
    </div>
  );
}
