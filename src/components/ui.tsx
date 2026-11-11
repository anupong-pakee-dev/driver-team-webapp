import Link from "next/link";
import type { ReactNode } from "react";

// ชิ้นส่วน UI ร่วมตามดีไซน์ "ใบชา" (1a ลูกค้า / 2a คนขับ·หลังบ้าน): พื้นครีม การ์ดขอบมน ตัวหนังสือเขียวเข้ม

export function AppHeader({
  title, subtitle, right, back, backLabel = "กลับ",
}: { title: string; subtitle?: string; right?: ReactNode; back?: string; backLabel?: string }) {
  return (
    <header className="flex items-center gap-3 px-5 pb-2 pt-4">
      {back && (
        <Link href={back} aria-label={backLabel} className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-chip">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </Link>
      )}
      <div className="min-w-0 flex-1">
        <h1 className="text-xl font-bold leading-snug">{title}</h1>
        {subtitle && <p className="text-sm text-muted">{subtitle}</p>}
      </div>
      {right && <div className="shrink-0 self-start">{right}</div>}
    </header>
  );
}

export function Panel({ title, children, className = "" }: { title?: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-[var(--radius-card)] border border-line bg-card p-4 ${className}`}>
      {title && <h2 className="mb-3 text-base font-bold">{title}</h2>}
      {children}
    </section>
  );
}

const TONES = {
  ok: "bg-sage-soft text-sage",
  warn: "bg-warn/10 text-warn",
  bad: "bg-bad/10 text-bad",
  info: "bg-chip text-ink",
} as const;

export function Badge({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

/** จุดสี + ข้อความ (ใช้ในตารางหลังบ้าน 2a) */
export function StatusDot({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  const c = { ok: "text-sage", warn: "text-warn", bad: "text-bad", info: "text-ink" }[tone];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[0.8rem] font-semibold ${c}`}>
      <span className="h-[7px] w-[7px] rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-2xl bg-page px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

/** ตัวเลือกแบบแคปซูล (segmented control) — ปุ่มที่เลือกเป็นพื้นขาวลอย */
export const segWrap = "grid gap-1 rounded-2xl bg-chip p-1";
export const segItem = (on: boolean) =>
  "min-h-10 rounded-[0.7rem] px-2 text-sm transition-colors " +
  (on ? "bg-card font-semibold text-ink shadow-[0_1px_3px_rgba(40,30,10,.1)]" : "text-muted");

/** แถบล่างลอยสีเขียวเข้ม (ราคา + ปุ่มหลัก) */
export const floatBar =
  "fixed inset-x-3 bottom-[max(0.875rem,env(safe-area-inset-bottom))] z-10 mx-auto flex max-w-[calc(28rem-1.5rem)] items-center justify-between gap-3 rounded-3xl bg-forest py-2.5 pl-5 pr-2.5 text-white shadow-[0_10px_30px_rgba(31,43,38,.25)]";

/** จอคอม (lg ขึ้นไป): แถบลอยกลายเป็นการ์ดในเนื้อหา ไม่บังรายการ */
export const floatBarDesk = " lg:static lg:inset-auto lg:mx-0 lg:mt-4 lg:max-w-none";

/** ปุ่มหลักบนพื้นสว่าง = เขียวเข้ม · ปุ่มทราย (btnSand) ใช้บนพื้นมืดเท่านั้น */
export const btnPrimary =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-forest px-5 py-3 font-bold text-white shadow-sm disabled:opacity-50";
export const btnSand =
  "inline-flex items-center justify-center gap-2 rounded-[1.125rem] bg-sand px-5 py-3 font-bold text-forest disabled:opacity-50";
export const btnDark =
  "inline-flex items-center justify-center gap-2 rounded-[var(--radius-btn)] bg-forest px-5 py-3 font-semibold text-white disabled:opacity-50";
export const btnSage =
  "inline-flex items-center justify-center gap-2 rounded-[1.375rem] bg-sage px-5 py-4 text-lg font-bold text-white shadow-[0_10px_30px_rgba(47,107,87,.3)] disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-[var(--radius-btn)] border border-line bg-card px-4 py-2.5 font-medium text-ink disabled:opacity-50";
export const input =
  "w-full rounded-[0.875rem] border border-line bg-card px-3.5 py-3 text-base text-ink placeholder:text-muted/80 focus:border-sage focus:outline-none";
