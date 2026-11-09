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

export function DriverShell({
  title, subtitle, active, children,
}: { title: string; subtitle?: string; active: (typeof TABS)[number]["key"] | null; children: ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <AppHeader title={title} subtitle={subtitle} right={<LogoutButton to="/liff/driver" />} />
      <main className="flex-1 space-y-4 px-5 pb-24 pt-4">{children}</main>
      <nav className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card" aria-label="เมนูคนขับ">
        <div className="mx-auto grid max-w-md grid-cols-4 pb-[env(safe-area-inset-bottom)]">
          {TABS.map((t) => (
            <Link
              key={t.key}
              href={t.href}
              aria-current={active === t.key ? "page" : undefined}
              className={"py-3.5 text-center text-sm " + (active === t.key ? "font-bold text-navy" : "text-muted")}
            >
              {t.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}

export function DriverLoginScreen({ notDriver }: { notDriver?: boolean }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <AppHeader title="สำหรับคนขับ" subtitle="เข้าสู่ระบบด้วย LINE ที่ได้รับเชิญ" />
      <main className="px-5">
        {notDriver && <p className="pt-6 text-center text-bad">บัญชีนี้ไม่ใช่บัญชีคนขับ</p>}
        <LiffLogin app="driver" liffId={process.env.NEXT_PUBLIC_LIFF_ID_DRIVER} devLogin={devLoginEnabled()} />
      </main>
    </div>
  );
}
