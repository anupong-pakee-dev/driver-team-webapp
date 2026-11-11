"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// เมนูตาม §3 · ดีไซน์ 2a: จัดกลุ่มด้วยหัวข้อเล็ก · หน้าที่อยู่เป็นพื้นเขียวเข้ม
const ITEMS: { href?: string; label: string; phase?: number; head?: string }[] = [
  { href: "/admin", label: "กล่องงานวันนี้", head: "งานประจำวัน" },
  { href: "/admin/usage", label: "ภาพรวมการใช้งาน" },
  { href: "/admin/quotes", label: "ใบเสนอราคา" },
  { href: "/admin/bookings", label: "การจอง / การเงิน" },
  { href: "/admin/payouts", label: "จ่ายเงินคนขับ" },
  { href: "/admin/drivers", label: "คนขับ", head: "ทีม" },
  { href: "/admin/vehicles", label: "รถ" },
  { href: "/admin/documents", label: "ตรวจเอกสาร" },
  { href: "/admin/compliance", label: "กฎ ขบ." },
  { href: "/admin/ads", label: "แคมเปญ / แอด", head: "ธุรกิจ" },
  { href: "/admin/reports", label: "รายงาน / Export" },
  { href: "/admin/users", label: "ผู้ใช้", head: "ระบบ" },
  { href: "/admin/prices", label: "ราคา" },
  { href: "/admin/settings", label: "ตั้งค่า" },
  { href: "/admin/audit", label: "บันทึกการแก้ไข" },
  { href: "/admin/system", label: "ระบบ" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav aria-label="เมนูหลังบ้าน" className="flex gap-0.5 overflow-x-auto px-3 pb-3 md:flex-col md:overflow-visible md:px-3.5">
      {ITEMS.map((it) => {
        const on = !!it.href && (path === it.href || (it.href !== "/admin" && path.startsWith(it.href + "/")));
        return (
          <div key={it.label} className="contents">
            {it.head && (
              <span className="hidden px-2.5 pb-1 pt-3 font-mono text-[0.7rem] font-medium tracking-wide text-muted md:block">{it.head}</span>
            )}
            {it.href ? (
              <Link
                href={it.href}
                aria-current={on ? "page" : undefined}
                className={
                  "whitespace-nowrap rounded-[0.625rem] px-2.5 py-[0.4375rem] text-sm " +
                  (on ? "bg-forest font-semibold text-white" : "text-[#3c4a43] hover:bg-chip")
                }
              >
                {it.label}
              </Link>
            ) : (
              <span className="flex items-center justify-between gap-2 whitespace-nowrap rounded-[0.625rem] px-2.5 py-[0.4375rem] text-sm text-muted">
                {it.label}
                <span className="rounded bg-chip px-1.5 text-[0.65rem]">เฟส {it.phase}</span>
              </span>
            )}
          </div>
        );
      })}
    </nav>
  );
}
