"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { liffIdFor, markSignedOut, type LiffApp } from "@/lib/liffSignOut";
import { useI18n } from "./i18nContext";

/** app = แอป LIFF ที่ออกจากระบบ (ลูกค้า/คนขับ) — ไม่ส่ง = หลังบ้าน */
export function LogoutButton({ to = "/", className = "", app }: { to?: string; className?: string; app?: LiffApp }) {
  const router = useRouter();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      disabled={busy}
      className={className || "rounded-full bg-chip px-3 py-1.5 text-sm font-medium disabled:opacity-60"}
      onClick={async () => {
        setBusy(true);
        if (app) {
          // ต้องตั้งก่อนกลับหน้าแรก ไม่งั้นหน้านั้น login ด้วย LINE ให้อัตโนมัติทันที
          markSignedOut(app);
          const liffId = liffIdFor(app);
          if (liffId) {
            try {
              const liff = (await import("@line/liff")).default;
              await liff.init({ liffId });
              // นอกแอป LINE: ลบ token ของ LIFF ในเบราว์เซอร์ด้วย (ในแอป LINE ทำไม่ได้/ไม่จำเป็น)
              if (liff.isLoggedIn() && !liff.isInClient()) liff.logout();
            } catch { /* ออกจากเว็บได้ก็พอ */ }
          }
        }
        await fetch("/api/auth/logout", { method: "POST" });
        router.push(to);
        router.refresh();
      }}
    >
      {t.common.logout}
    </button>
  );
}
