import type { ReactNode } from "react";

// ชิ้นส่วน UI ร่วมตามโทนของแคตตาล็อก (navy + amber, การ์ดขอบมน)

export function AppHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
  return (
    <header className="bg-navy px-5 pb-6 pt-5 text-white">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold leading-snug">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-amber-soft">{subtitle}</p>}
        </div>
        {right}
      </div>
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
  ok: "bg-ok/10 text-ok",
  warn: "bg-warn/10 text-warn",
  bad: "bg-bad/10 text-bad",
  info: "bg-navy/10 text-navy",
} as const;

export function Badge({ tone = "info", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-page px-4 py-6 text-center text-sm text-muted">{children}</p>;
}

export const btnPrimary =
  "inline-flex items-center justify-center rounded-[var(--radius-btn)] bg-amber px-5 py-3 font-bold text-navy shadow-sm disabled:opacity-50";
export const btnSecondary =
  "inline-flex items-center justify-center rounded-[var(--radius-btn)] border border-line bg-card px-4 py-2.5 font-medium text-ink disabled:opacity-50";
export const input =
  "w-full rounded-xl border border-line bg-card px-3.5 py-3 text-base text-ink placeholder:text-muted/70 focus:border-navy focus:outline-none";
