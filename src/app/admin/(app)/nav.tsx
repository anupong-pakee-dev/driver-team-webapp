"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// เมนูตาม §3 · รายการที่ยังไม่สร้างแสดงเฟสที่จะมา
const ITEMS: { href?: string; label: string; phase?: number }[] = [
  { href: "/admin", label: "กล่องงานวันนี้" },
  { href: "/admin/quotes", label: "ใบเสนอราคา" },
  { href: "/admin/bookings", label: "การจอง / การเงิน" },
  { href: "/admin/payouts", label: "จ่ายเงินคนขับ" },
  { href: "/admin/drivers", label: "คนขับ" },
  { href: "/admin/vehicles", label: "รถ" },
  { href: "/admin/documents", label: "ตรวจเอกสาร" },
  { href: "/admin/compliance", label: "กฎ ขบ." },
  { href: "/admin/ads", label: "แคมเปญ / แอด" },
  { href: "/admin/reports", label: "รายงาน / Export" },
  { href: "/admin/users", label: "ผู้ใช้" },
  { href: "/admin/prices", label: "ราคา" },
  { href: "/admin/settings", label: "ตั้งค่า" },
  { href: "/admin/audit", label: "บันทึกการแก้ไข" },
  { href: "/admin/system", label: "ระบบ" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible">
      {ITEMS.map((it) =>
        it.href ? (
          <Link
            key={it.label}
            href={it.href}
            className={
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm " +
              (path === it.href || (it.href !== "/admin" && path.startsWith(it.href + "/")) ? "bg-white/15 font-semibold" : "text-white/85 hover:bg-white/10")
            }
          >
            {it.label}
          </Link>
        ) : (
          <span key={it.label} className="flex items-center justify-between gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm text-white/40">
            {it.label}
            <span className="rounded bg-white/10 px-1.5 text-[0.65rem]">เฟส {it.phase}</span>
          </span>
        ),
      )}
    </nav>
  );
}
