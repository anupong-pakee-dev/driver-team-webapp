"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { LOCALES, LOCALE_NAMES } from "@/i18n/core";
import { useI18n } from "./i18nContext";

// ปุ่มเปลี่ยนภาษา TH / EN / 中文 — บันทึกใน cookie และบัญชี (ข้อความ LINE ส่งตามภาษานี้)
export function LanguageSwitcher({ tone = "light" }: { tone?: "dark" | "light" }) {
  const router = useRouter();
  const { locale, t } = useI18n();
  const [busy, setBusy] = useState(false);
  const base = tone === "dark" ? "border border-white/30 text-white" : "bg-chip p-0.5 text-ink";
  return (
    <div role="group" aria-label={t.lang.label} className={`inline-flex overflow-hidden rounded-full text-[0.8rem] ${base}`}>
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l === "zh" ? "zh-Hans" : l}
          aria-pressed={l === locale}
          disabled={busy}
          className={"whitespace-nowrap rounded-full px-2.5 py-1.5 " + (l === locale ? (tone === "dark" ? "bg-white/20 font-semibold" : "bg-card font-semibold shadow-[0_1px_3px_rgba(40,30,10,.1)]") : "text-muted")}
          onClick={async () => {
            if (l === locale) return;
            setBusy(true);
            await fetch("/api/locale", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ locale: l }) });
            // ลิงก์แอดที่มี ?lang= บังคับภาษา → เอาออกเพื่อให้ภาษาที่เลือกมีผล
            const url = new URL(window.location.href);
            if (url.searchParams.has("lang")) {
              url.searchParams.delete("lang");
              router.replace(url.pathname + url.search);
            } else router.refresh();
            setBusy(false);
          }}
        >
          {LOCALE_NAMES[l]}
        </button>
      ))}
    </div>
  );
}
