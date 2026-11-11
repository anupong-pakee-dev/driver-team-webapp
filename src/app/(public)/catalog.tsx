"use client";

import Link from "next/link";
import { useState } from "react";
import type { CatalogTab } from "@/services/catalog";
import { formatBaht } from "@/lib/money";
import { Card, Close, Menu, Pin, Receipt, ShieldCheck } from "@/components/icons";
import { useI18n } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { floatBar, segItem, segWrap } from "@/components/ui";

// ดีไซน์ 1a · ใบชา — รถที่เลือกเป็นการ์ดใหญ่ · คันอื่นเป็นแถวกะทัดรัด · แถบราคาลอยด้านล่าง
const PHOTO_BIG = "bg-[repeating-linear-gradient(135deg,#e9efe9_0_10px,#e1e9e3_10px_20px)]";
const PHOTO_SMALL = "bg-[repeating-linear-gradient(135deg,#efebe2_0_6px,#e8e3d8_6px_12px)]";

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
      <header className="flex items-center justify-between px-5 pt-[1.125rem]">
        <span className="text-[1.0625rem] font-bold tracking-tight">{brandName}</span>
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="grid h-11 w-11 place-items-center rounded-full bg-chip"
            aria-label={c.menu}
          >
            <Menu className="h-[22px] w-[22px]" />
          </button>
        </div>
      </header>

      <section className="px-5 pt-5">
        <h1 className="text-[1.875rem] font-bold leading-[1.3] tracking-tight">
          {c.headline1}
          <br />
          <span className="text-sage">{c.headline2}</span>
        </h1>
        <p className="mt-3 flex items-center gap-1.5 text-[0.8125rem] text-muted">
          <ShieldCheck className="h-4 w-4 shrink-0 text-sage" />
          {c.trust}
        </p>
      </section>

      <main className="flex-1 px-5 pb-32 pt-5">
        <div role="tablist" aria-label={c.services} className={`${segWrap} grid-cols-3 rounded-full`}>
          {tabs.map((t, i) => (
            <button
              key={t.serviceType}
              role="tab"
              aria-selected={i === tabIdx}
              onClick={() => {
                setTabIdx(i);
                setSelected(t.items.find((x) => x.carType === selected)?.carType ?? t.items[0]?.carType ?? null);
              }}
              className={segItem(i === tabIdx) + " rounded-full"}
            >
              {t.label}
            </button>
          ))}
        </div>

        <p className="mt-2.5 text-[0.8125rem] text-muted">{tab?.note}</p>

        {tab && tab.items.length === 0 && (
          <p className="mt-3 rounded-[var(--radius-card)] border border-line bg-card px-4 py-8 text-center text-muted">
            {c.noCars}
          </p>
        )}

        <ul className="mt-3.5 space-y-2" role="radiogroup" aria-label={c.chooseCar}>
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
                    "w-full overflow-hidden bg-card text-left transition-shadow " +
                    (on ? "rounded-[var(--radius-card)] border-2 border-sage" : "flex items-center gap-3 rounded-[1.125rem] border border-line py-2.5 pl-2.5 pr-3.5")
                  }
                >
                  {on ? (
                    <>
                      {/* รูปรถจริงจาก bucket public-assets ในเฟส 3 */}
                      <div className={`grid h-[150px] place-items-center font-mono text-xs text-sage ${PHOTO_BIG}`}>{c.photo(it.name)}</div>
                      <div className="flex items-end justify-between gap-3 px-4 py-3.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[1.1875rem] font-bold leading-tight">{it.name}</span>
                            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sage" aria-hidden="true">
                              <svg viewBox="0 0 24 24" className="h-[13px] w-[13px]" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                            </span>
                          </div>
                          <div className="mt-0.5 text-[0.8125rem] text-muted">{it.sub}</div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-xs text-muted">{c.from}</div>
                          <div className="text-[1.625rem] font-bold leading-none">{formatBaht(it.fromSatang)}</div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className={`h-11 w-14 shrink-0 rounded-xl ${PHOTO_SMALL}`} aria-hidden="true" />
                      <div className="min-w-0 flex-1">
                        <div className="text-[0.9375rem] font-semibold">{it.name}</div>
                        <div className="text-xs text-muted">{it.sub}</div>
                      </div>
                      <div className="text-base font-bold">{formatBaht(it.fromSatang)}</div>
                    </>
                  )}
                </button>
              </li>
            );
          })}
        </ul>

        <ul className="mt-6 grid grid-cols-3 text-center text-[0.8125rem] text-muted">
          <li className="flex flex-col items-center gap-1.5">
            <Card className="h-6 w-6 text-sage" />
            {c.pay}
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <Pin className="h-6 w-6 text-sage" />
            {c.track}
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <Receipt className="h-6 w-6 text-sage" />
            {c.receipt}
          </li>
        </ul>
      </main>

      <div className={floatBar}>
        <div className="min-w-0">
          <div className="truncate text-xs text-on-dark">{item ? `${item.name} · ${tab.label}` : c.selected("—")}</div>
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
          className="flex h-[52px] shrink-0 items-center gap-2 rounded-[1.125rem] bg-sand px-5 text-base font-bold text-forest active:translate-y-px"
        >
          {c.cta}
          <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </Link>
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-20 bg-forest/60" onClick={() => setMenuOpen(false)}>
          <nav
            className="ml-auto flex h-full w-72 max-w-[85%] flex-col gap-1 bg-card p-5"
            onClick={(e) => e.stopPropagation()}
            aria-label={c.mainMenu}
          >
            <button className="mb-4 grid h-10 w-10 place-items-center self-end rounded-full bg-chip" onClick={() => setMenuOpen(false)} aria-label={c.closeMenu}>
              <Close className="h-5 w-5" />
            </button>
            <Link className="rounded-xl px-3 py-3 font-medium hover:bg-page" href="/liff/customer">{c.myBookings}</Link>
            {/* หน้าคนขับไม่มีลิงก์จากหน้าลูกค้า — คนขับเข้าผ่านลิงก์เชิญ / LIFF ของคนขับ / พิมพ์ /liff/driver */}
          </nav>
        </div>
      )}
    </div>
  );
}
