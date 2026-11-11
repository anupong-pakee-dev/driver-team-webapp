import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { isLocale, localized, messages, type Locale } from "@/i18n";
import { getLocale } from "@/lib/locale";
import { getSetting } from "@/lib/settings";
import { formatBaht } from "@/lib/money";
import { loadCatalog } from "@/services/catalog";
import { Card, Pin, Receipt, ShieldCheck } from "@/components/icons";
import { I18nProvider } from "@/components/I18nProvider";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { btnPrimary } from "@/components/ui";
import { QuoteCta } from "./tracker";

export const dynamic = "force-dynamic";

// FR-ADS-14 หน้า landing ต่อบริการ (ไทย/อังกฤษ/จีน — ?lang=en|zh ในลิงก์แอดใช้แทนภาษาของผู้ชม) · ราคา "เริ่ม" จาก price_rules สด (BR-PRICE-04)
// เผยแพร่ได้หลังเจ้าของยืนยันเช็กลิสต์ (FR-ADS-17) · ไม่โฆษณา "ติดตามรถสด" จนกว่า FR-BOOK-05 จะเปิดใช้ · โฆษณาเฉพาะประเภทที่มีรถพร้อม (BR-ADS-02)

const SERVICES = ["airport_transfer", "daily_charter", "point_to_point", "hourly_charter"] as const;
type Service = (typeof SERVICES)[number];

async function landingLocale(lang: unknown): Promise<Locale> {
  return isLocale(lang) ? lang : getLocale();
}

export async function generateMetadata({ params, searchParams }: PageProps<"/l/[service]">): Promise<Metadata> {
  const s = (await params).service as Service;
  const t = messages(await landingLocale((await searchParams).lang));
  return { title: t.landing.titles[s]?.[0] ?? t.catalog.headline1, description: t.landing.titles[s]?.[1] };
}

export default async function Landing({ params, searchParams }: PageProps<"/l/[service]">) {
  const service = (await params).service as Service;
  if (!SERVICES.includes(service)) notFound();
  const lang = await landingLocale((await searchParams).lang);
  const t = messages(lang);
  const published = (await getSetting<Record<string, unknown>>("landing_published")) ?? {};
  if (!published[service]) notFound();
  const { brand, tabs } = await loadCatalog(lang);
  const items = tabs.find((x) => x.serviceType === service)?.items ?? [];
  const [title, sub] = t.landing.titles[service];

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header className="px-5 pb-2 pt-[1.125rem]">
        <div className="flex items-center justify-between">
          <span className="text-[1.0625rem] font-bold tracking-tight">{localized(brand, "name", lang)}</span>
          <I18nProvider locale={lang}><LanguageSwitcher /></I18nProvider>
        </div>
        <h1 className="mt-6 text-[1.75rem] font-bold leading-[1.3] tracking-tight">{title}</h1>
        <p className="mt-2 text-muted">{sub}</p>
        <p className="mt-3 flex items-center gap-2 text-[0.8125rem] text-muted"><ShieldCheck className="h-4 w-4 text-sage" />{t.catalog.trust}</p>
      </header>
      <main className="flex-1 space-y-3 px-5 py-5 pb-10">
        {items.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-line bg-card px-4 py-8 text-center text-muted">{t.landing.none}</p>
        ) : items.map((it) => (
          <div key={it.carType} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-card p-4">
            <div className="flex-1">
              <div className="text-lg font-bold">{it.name}</div>
              <div className="text-sm text-muted">{it.sub}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">{t.catalog.from}</div>
              <div className="text-xl font-bold">{formatBaht(it.fromSatang)}</div>
            </div>
          </div>
        ))}
        {items.length > 0 && <QuoteCta service={service} label={t.catalog.cta} className={`${btnPrimary} w-full py-4 text-lg`} />}
        <ul className="grid grid-cols-3 pt-4 text-center text-sm text-muted">
          <li className="flex flex-col items-center gap-1.5"><Card className="h-6 w-6 text-sage" />{t.catalog.pay}</li>
          <li className="flex flex-col items-center gap-1.5"><Pin className="h-6 w-6 text-sage" />{t.landing.track}</li>
          <li className="flex flex-col items-center gap-1.5"><Receipt className="h-6 w-6 text-sage" />{t.catalog.receipt}</li>
        </ul>
        <p className="pt-6 text-center text-xs text-muted">
          <Link href="/" className="underline">{t.landing.all}</Link> · <Link href="/privacy" className="underline">{t.landing.privacy}</Link>
        </p>
      </main>
    </div>
  );
}
