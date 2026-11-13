"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { apiErrorText } from "@/i18n/core";
import { clearSignedOut, isSignedOut, type LiffApp } from "@/lib/liffSignOut";
import { useI18n } from "./i18nContext";
import { btnPrimary } from "./ui";

// §9.1 LIFF: init → login → ID token → POST /api/auth/liff → session cookie
// ผู้ใช้กด "ออกจากระบบ" เอง → ไม่ login อัตโนมัติ จนกว่าจะกดปุ่ม "เข้าสู่ระบบด้วย LINE"

const noSubscribe = () => () => {};

export function LiffLogin({ app, liffId, devLogin }: { app: LiffApp; liffId?: string; devLogin: boolean }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [wantLogin, setWantLogin] = useState(false);
  // อ่านจาก localStorage หลัง hydrate เท่านั้น (ฝั่งเซิร์ฟเวอร์ = ยังไม่ออกจากระบบ)
  const signedOut = useSyncExternalStore(noSubscribe, () => isSignedOut(app), () => false) && !wantLogin;

  useEffect(() => {
    if (!liffId || signedOut) return;
    let cancelled = false;
    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
        // ลิงก์ liff.line.me/<id>/join?... มาถึงหน้าหลักพร้อม liff.state → liff.init กำลังพาไปหน้านั้น อย่า login ซ้ำที่นี่
        if (new URLSearchParams(window.location.search).has("liff.state")) return;
        const idToken = liff.getIDToken();
        if (!idToken) throw new Error("no id token");
        const res = await fetch("/api/auth/liff", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id_token: idToken, app, lang: liff.getLanguage() }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error?.details?.reason ?? apiErrorText(body, locale) ?? `HTTP ${res.status}`);
        }
        if (!cancelled) router.refresh();
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [app, liffId, signedOut, router, locale]);

  if (liffId && signedOut) {
    return (
      <div className="space-y-4 py-10 text-center">
        <p className="text-muted">{t.common.signedOut}</p>
        <button
          type="button"
          className={btnPrimary}
          onClick={() => {
            clearSignedOut(app);
            setError(null);
            setWantLogin(true);
          }}
        >
          {t.common.signInLine}
        </button>
      </div>
    );
  }

  if (liffId) {
    return (
      <div className="py-10 text-center text-muted">
        {error ? (
          <>
          <p className="text-bad">
            {t.common.loginFailed(
              error === "DRIVER_NOT_INVITED" || error === "NOT_A_DRIVER"
                ? "บัญชี LINE นี้ยังไม่ได้ลงทะเบียนเป็นคนขับ"
                : error,
            )}
          </p>
          {app === "driver" && (error === "DRIVER_NOT_INVITED" || error === "NOT_A_DRIVER") && (
            <Link href="/liff/driver/apply" className={`${btnPrimary} mt-4`}>สมัครเป็นคนขับ</Link>
          )}
          </>
        ) : (
          t.common.signingIn
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 py-6 text-center">
      <p className="text-muted">{app === "customer" ? t.common.noLiff : "ยังไม่ได้ตั้งค่า LIFF ID สำหรับแอปคนขับ"}</p>
      {devLogin && (
        <Link className={btnPrimary} href={`/dev/login?next=/liff/${app}`}>
          {t.common.devLogin}
        </Link>
      )}
    </div>
  );
}
