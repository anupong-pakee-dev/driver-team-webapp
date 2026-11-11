import Link from "next/link";
import type { ReactNode } from "react";
import { devLoginEnabled } from "@/lib/dev";
import { LiffLogin } from "@/components/LiffLogin";
import { LogoutButton } from "@/components/LogoutButton";
import { AppHeader } from "@/components/ui";

const TABS = [
  { href: "/liff/driver", key: "home", label: "งาน" },
  { href: "/liff/driver/documents", key: "documents", label: "เอกสาร/รถ" },
  { href: "/liff/driver/calendar", key: "calendar", label: "ปฏิทิน" },
  { href: "/liff/driver/earnings", key: "earnings", label: "รายได้" },
] as const;

// ดีไซน์ 2a · ใบชา: หัวเรื่องบนพื้นครีม · เมนูล่างเป็นแคปซูลลอย (แท็บที่อยู่เป็นพื้นเขียวเข้ม)
// จอคอม (lg): เมนูย้ายขึ้นไปใต้หัวเรื่อง · ปุ่มหลักอยู่ท้ายเนื้อหา (ไม่ลอย) · columns=2 แบ่งเนื้อหาเป็น 2 คอลัมน์
export function DriverShell({
  title, subtitle, active, children, back, extra, bottom, columns = 1,
}: {
  title: string; subtitle?: string; active: (typeof TABS)[number]["key"] | null; children: ReactNode;
  /** ลิงก์ย้อนกลับ (หน้าวันงาน) */ back?: string;
  /** ป้ายข้างปุ่มออกจากระบบ เช่น "พร้อมรับงาน" */ extra?: ReactNode;
  /** ปุ่มหลักลอยด้านล่าง (แทนเมนูล่าง) */ bottom?: ReactNode;
  /** จำนวนคอลัมน์บนจอคอม */ columns?: 1 | 2;
}) {
  return (
    <div className={"mx-auto flex w-full max-w-md flex-1 flex-col lg:py-6 " + (columns === 2 ? "lg:max-w-5xl" : "lg:max-w-2xl")}>
      <AppHeader
        title={title}
        subtitle={subtitle}
        back={back}
        right={<div className="flex flex-col items-end gap-2">{extra}<LogoutButton to="/liff/driver" /></div>}
      />
      <main className={"flex-1 space-y-3 px-4 pt-3 lg:order-1 lg:px-5 lg:pb-6 " + (bottom ? "pb-36" : "pb-28") +
        (columns === 2 ? " lg:grid lg:grid-cols-2 lg:items-start lg:gap-4 lg:space-y-0" : "")}>{children}</main>
      {bottom ? (
        <div className="fixed inset-x-4 bottom-[max(1.125rem,env(safe-area-inset-bottom))] z-10 mx-auto max-w-[calc(28rem-2rem)] lg:static lg:order-2 lg:mx-5 lg:max-w-none lg:pb-8">{bottom}</div>
      ) : (
        <nav
          className="fixed inset-x-4 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-10 mx-auto grid max-w-[calc(28rem-2rem)] grid-cols-4 rounded-[1.375rem] border border-line bg-card p-1.5 shadow-[0_6px_20px_rgba(40,30,10,.08)] lg:static lg:mx-5 lg:mt-2 lg:max-w-md lg:shadow-none"
          aria-label="เมนูคนขับ"
        >
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? "page" : undefined}
              className={"rounded-2xl py-2.5 text-center text-[0.8125rem] " + (active === t.key ? "bg-forest font-semibold text-white" : "text-muted")}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function DriverLoginScreen({ notDriver }: { notDriver?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
      <AppHeader title="สำหรับคนขับ" subtitle="เข้าสู่ระบบด้วย LINE ที่ได้รับเชิญ" />
      <main className="px-5">
        {notDriver && <p className="pt-6 text-center text-bad">บัญชีนี้ไม่ใช่บัญชีคนขับ</p>}
        <LiffLogin app="driver" liffId={process.env.NEXT_PUBLIC_LIFF_ID_DRIVER} devLogin={devLoginEnabled()} />
      </main>
    </div>
  );
}
