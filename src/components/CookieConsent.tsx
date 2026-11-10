"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useI18n } from "./I18nProvider";

// FR-PDPA-05 / FR-ADS-10: ถามก่อน · โหลด Pixel หลังยินยอมเท่านั้น · ปฏิเสธ = ไม่มี request ไปแพลตฟอร์มโฆษณา
// ค่า mc (1/0) อ่านจาก cookie ฝั่ง client เพื่อแสดง/ซ่อนแบนเนอร์ — การบันทึกจริงอยู่ที่ /api/consents/cookie

export function readConsent(): "1" | "0" | null {
  const m = /(?:^|;\s*)mc=([01])/.exec(typeof document === "undefined" ? "" : document.cookie);
  return (m?.[1] as "1" | "0" | undefined) ?? null;
}

export const CONSENT_EVENT = "mc-consent";

function loadMetaPixel(id: string) {
  if (document.getElementById("meta-pixel")) return;
  const s = document.createElement("script");
  s.id = "meta-pixel";
  s.async = true;
  s.src = "https://connect.facebook.net/en_US/fbevents.js";
  type Fbq = ((...a: unknown[]) => void) & { queue: unknown[]; callMethod?: (...a: unknown[]) => void };
  const w = window as unknown as { fbq?: Fbq };
  if (!w.fbq) {
    // stub มาตรฐานของ Meta Pixel: เก็บคำสั่งไว้ในคิวจนสคริปต์โหลดเสร็จ
    const fbq: Fbq = Object.assign((...args: unknown[]) => {
      if (fbq.callMethod) fbq.callMethod(...args);
      else fbq.queue.push(args);
    }, { queue: [] as unknown[] });
    w.fbq = fbq;
  }
  document.head.appendChild(s);
  w.fbq("init", id);
  w.fbq("track", "PageView");
}

export function CookieConsent({ pixelId }: { pixelId?: string }) {
  const { t } = useI18n();
  const [state, setState] = useState<"1" | "0" | null | "loading">("loading");

  useEffect(() => {
    // อ่าน cookie หลัง mount เท่านั้น (server render ไม่รู้ค่า)
    const v = readConsent();
    queueMicrotask(() => setState(v));
    if (v === "1" && pixelId) loadMetaPixel(pixelId);
  }, [pixelId]);

  async function decide(granted: boolean) {
    await fetch("/api/consents/cookie", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ granted }) });
    setState(granted ? "1" : "0");
    if (granted && pixelId) loadMetaPixel(pixelId);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: granted }));
  }

  if (state !== null) return null;
  return (
    <div role="dialog" aria-label={t.cookie.label} className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]">
      <div className="mx-auto max-w-md space-y-3 text-sm">
        <p>
          {t.cookie.text}{" "}
          <Link href="/privacy" className="text-navy underline">{t.cookie.more}</Link>
        </p>
        <div className="flex gap-2">
          <button className="flex-1 rounded-[var(--radius-btn)] border border-line px-4 py-2.5 font-medium" onClick={() => decide(false)}>{t.cookie.necessary}</button>
          <button className="flex-1 rounded-[var(--radius-btn)] bg-navy px-4 py-2.5 font-bold text-white" onClick={() => decide(true)}>{t.cookie.acceptAll}</button>
        </div>
      </div>
    </div>
  );
}
