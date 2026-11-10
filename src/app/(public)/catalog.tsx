"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogTab } from "@/services/catalog";
import { formatBaht } from "@/lib/money";
import { Card, Close, Menu, Pin, Receipt, ShieldCheck } from "@/components/icons";
import { useI18n } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

export function Catalog({ brandName, tabs }: { brandName: string; tabs: CatalogTab[] }) {
  const { t } = useI18n();
  const c = t.catalog;
  const [tabIdx, setTabIdx] = useState(0);
  const tab = tabs[tabIdx];
  const [selected, setSelected] = useState<string | null>(tab?.items[1]?.carType ?? tab?.items[0]?.carType ?? null);
  const [menuOpen, setMenuOpen] = useState(false);
  const item = tab?.items.find((i) => i.carType === selected) ?? null;

  const quoteHref = item
    ? `/liff/customer/quote?service=${tab.serviceType}&car=${item.carType}`
    : "/liff/customer/quote";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col bg-page">
      <header className="bg-navy px-5 pb-8 pt-5 text-white">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold tracking-tight">{brandName}</span>
          <div className="flex items-center gap-2">
            <LanguageSwitcher />
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              className="grid h-12 w-12 place-items-center rounded-[var(--radius-btn)] border border-white/25"
              aria-label={c.menu}
            >
              <Menu className="h-6 w-6" />
            </button>
          </div>
        </div>
        <h1 className="mt-7 text-[1.75rem] font-bold leading-snug">
          {c.headline1}
          <br />
          {c.headline2}
        </h1>
        <p className="mt-2 flex items-center gap-2 text-[0.95rem] text-amber-soft">
          <ShieldCheck className="h-5 w-5 shrink-0" />
          {c.trust}
        </p>
      </header>

      <main className="flex-1 px-5 pb-32 pt-4">
        <div role="tablist" aria-label={c.services} className="grid grid-cols-3 gap-2">
          {tabs.map((t, i) => (
            <button
              key={t.serviceType}
              role="tab"
              aria-selected={i === tabIdx}
              onClick={() => {
                setTabIdx(i);
                setSelected(t.items.find((x) => x.carType === selected)?.carType ?? t.items[0]?.carType ?? null);
              }}
              className={
                "h-12 rounded-[var(--radius-btn)] text-[0.95rem] font-medium transition-colors " +
                (i === tabIdx ? "bg-navy text-white font-semibold" : "border border-line bg-card text-ink")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mt-3 text-sm text-muted">{tab?.note}</p>

        {tab && tab.items.length === 0 && (
          <p className="mt-3 rounded-[var(--radius-card)] border border-line bg-card px-4 py-8 text-center text-muted">
            {c.noCars}
          </p>
        )}

        <ul className="mt-3 space-y-3" role="radiogroup" aria-label={c.chooseCar}>
          {tab?.items.map((it) => {
            const on = it.carType === selected;
            return (
              <li key={it.carType}>
                <button
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setSelected(it.carType)}
                  className={
                    "flex w-full items-center gap-3 rounded-[var(--radius-card)] bg-card p-3 text-left transition-shadow " +
                    (on ? "border-2 border-navy shadow-sm" : "border border-line")
                  }
                >
                  <div className="grid h-16 w-20 shrink-0 place-items-center rounded-xl bg-placeholder px-1 text-center text-[0.7rem] leading-tight text-muted">
                    {/* รูปรถจริงจาก bucket public-assets ในเฟส 3 */}
                    {c.photo(it.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-lg font-bold leading-tight">{it.name}</div>
                    <div className="mt-1 text-[0.8rem] text-muted">{it.sub}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted">{c.from}</div>
                    <div className="text-xl font-bold">{formatBaht(it.fromSatang)}</div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="mt-6 grid grid-cols-3 text-center text-sm text-muted">
          <li className="flex flex-col items-center gap-1.5">
            <Card className="h-6 w-6 text-navy" />
            {c.pay}
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <Pin className="h-6 w-6 text-navy" />
            {c.track}
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <Receipt className="h-6 w-6 text-navy" />
            {c.receipt}
          </li>
        </ul>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-card">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <div className="min-w-0">
            <div className="truncate text-sm text-muted">{c.selected(item?.name ?? "—")}</div>
            <div className="text-xl font-bold">
              {item
                ? item.toSatang > item.fromSatang
                  ? `${formatBaht(item.fromSatang, { symbol: false })}–${formatBaht(item.toSatang)}`
                  : `${c.from} ${formatBaht(item.fromSatang)}`
                : "—"}
            </div>
          </div>
          <Link
            href={quoteHref}
            aria-disabled={!item}
            className="rounded-[var(--radius-btn)] bg-amber px-6 py-3.5 text-base font-bold text-navy shadow-sm active:translate-y-px"
          >
            {c.cta}
          </Link>
        </div>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-20 bg-navy/60" onClick={() => setMenuOpen(false)}>
          <nav
            className="ml-auto flex h-full w-72 max-w-[85%] flex-col gap-1 bg-card p-5"
            onClick={(e) => e.stopPropagation()}
            aria-label={c.mainMenu}
          >
            <button className="mb-4 self-end p-2" onClick={() => setMenuOpen(false)} aria-label={c.closeMenu}>
              <Close className="h-6 w-6" />
            </button>
            <Link className="rounded-lg px-3 py-3 font-medium hover:bg-page" href="/liff/customer">{c.myBookings}</Link>
            {/* หน้าคนขับไม่มีลิงก์จากหน้าลูกค้า — คนขับเข้าผ่านลิงก์เชิญ / LIFF ของคนขับ / พิมพ์ /liff/driver */}
          </nav>
        </div>
      )}
    </div>
  );
}
