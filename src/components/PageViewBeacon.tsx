"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

// นับผู้เข้าชมหน้าลูกค้า (ไม่ระบุตัวตน ไม่ใช้คุกกี้) — ส่งเฉพาะ path และเว็บที่ส่งมา
// หน้าเดิมซ้ำภายใน 1 วินาที (React dev รัน effect 2 รอบ / refresh หลังเปลี่ยนภาษา) ไม่นับซ้ำ
let last: { path: string; at: number } | null = null;

export function PageViewBeacon() {
  const path = usePathname();
  useEffect(() => {
    if (last && last.path === path && Date.now() - last.at < 1000) return;
    last = { path, at: Date.now() };
    fetch("/api/pv", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, ref: document.referrer || null }),
      keepalive: true,
    }).catch(() => {});
  }, [path]);
  return null;
}
