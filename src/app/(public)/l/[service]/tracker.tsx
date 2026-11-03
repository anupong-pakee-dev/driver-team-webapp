"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CONSENT_EVENT, readConsent } from "@/components/CookieConsent";

const KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "gclid", "fbclid", "ttclid"] as const;
const STORE = "tp";

/** §7.7 ข้อ 1–2: บันทึก touchpoint หลังลูกค้าตัดสินใจเรื่องคุกกี้ → ส่ง id ต่อไปหน้า LIFF (?t=) */
export function useTouchpoint(service: string) {
  const [tp, setTp] = useState<string | null>(null);
  useEffect(() => {
    let done = false;
    const send = async () => {
      if (done || readConsent() === null) return;
      done = true;
      const sp = new URLSearchParams(window.location.search);
      const body: Record<string, string | null> = { campaign_slug: sp.get("c"), service_type: service, landing_url: window.location.pathname };
      for (const k of KEYS) body[k] = sp.get(k);
      if (!body.campaign_slug && KEYS.every((k) => !body[k])) {
        // เข้าตรง ไม่มีแคมเปญ — ใช้ id เดิมถ้ามี
        try { setTp(sessionStorage.getItem(STORE)); } catch { /* ignore */ }
        return;
      }
      const res = await fetch("/api/touchpoints", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (res.ok) {
        const { touchpoint_id } = await res.json();
        try { sessionStorage.setItem(STORE, touchpoint_id); } catch { /* ignore */ }
        setTp(touchpoint_id);
      }
    };
    send();
    window.addEventListener(CONSENT_EVENT, send);
    return () => window.removeEventListener(CONSENT_EVENT, send);
  }, [service]);
  return tp;
}

export function QuoteCta({ service, car, label, className }: { service: string; car?: string; label: string; className: string }) {
  const tp = useTouchpoint(service);
  const q = new URLSearchParams({ service, ...(car ? { car } : {}), ...(tp ? { t: tp } : {}) });
  return <Link href={`/liff/customer/quote?${q}`} className={className}>{label}</Link>;
}
