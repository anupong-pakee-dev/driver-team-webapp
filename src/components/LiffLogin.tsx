"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { apiErrorText } from "@/i18n";
import { useI18n } from "./I18nProvider";
import { btnPrimary } from "./ui";

// §9.1 LIFF: init → login → ID token → POST /api/auth/liff → session cookie
export function LiffLogin({ app, liffId, devLogin }: { app: "customer" | "driver"; liffId?: string; devLogin: boolean }) {
  const router = useRouter();
  const { t, locale } = useI18n();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!liffId) return;
    let cancelled = false;
    (async () => {
      try {
        const liff = (await import("@line/liff")).default;
        await liff.init({ liffId });
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: window.location.href });
          return;
        }
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
  }, [app, liffId, router, locale]);

  if (liffId) {
    return (
      <div className="py-10 text-center text-muted">
        {error ? (
          <p className="text-bad">
            {t.common.loginFailed(error === "DRIVER_NOT_INVITED" ? "บัญชี LINE นี้ยังไม่ได้รับเชิญเป็นคนขับ" : error)}
          </p>
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
