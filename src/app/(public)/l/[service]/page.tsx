import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getSetting } from "@/lib/settings";
import { formatBaht } from "@/lib/money";
import { loadCatalog } from "@/services/catalog";
import { Card, Pin, Receipt, ShieldCheck } from "@/components/icons";
import { btnPrimary } from "@/components/ui";
import { QuoteCta } from "./tracker";

export const dynamic = "force-dynamic";

// FR-ADS-14 หน้า landing ต่อบริการ (ไทย/อังกฤษ ?lang=en) · ราคา "เริ่ม" จาก price_rules สด (BR-PRICE-04)
// เผยแพร่ได้หลังเจ้าของยืนยันเช็กลิสต์ (FR-ADS-17) · ไม่โฆษณา "ติดตามรถสด" จนกว่า FR-BOOK-05 จะเปิดใช้ · โฆษณาเฉพาะประเภทที่มีรถพร้อม (BR-ADS-02)

const COPY = {
  th: {
    airport_transfer: ["รถรับ-ส่งสนามบิน พร้อมคนขับ", "สุวรรณภูมิ / ดอนเมือง ↔ ที่พัก · ราคาต่อเที่ยว รวมน้ำมันและคนขับ"],
    daily_charter: ["เหมารถพร้อมคนขับรายวัน", "คุณกำหนดเส้นทางเอง · 10 ชม. · รวมน้ำมันและคนขับ"],
    point_to_point: ["รถพร้อมคนขับ ไปต่างจังหวัด", "รับถึงที่ ส่งถึงที่ · คิดตามระยะทาง แจ้งราคาก่อนจอง"],
    hourly_charter: ["เหมารถพร้อมคนขับรายชั่วโมง", "ในกรุงเทพฯ 5 หรือ 10 ชั่วโมง"],
    trust: "คนขับทุกคนผ่านการตรวจประวัติและใบขับขี่", from: "เริ่ม", cta: "ขอใบเสนอราคา", none: "ตอนนี้ยังไม่มีรถว่างสำหรับบริการนี้",
    pay: "มัดจำผ่านระบบ", track: "แจ้งสถานะทาง LINE", receipt: "มีใบเสร็จ", privacy: "ความเป็นส่วนตัว", all: "ดูบริการทั้งหมด",
  },
  en: {
    airport_transfer: ["Airport transfer with driver", "BKK / DMK ↔ your hotel · per trip, fuel and driver included"],
    daily_charter: ["Car with driver by the day", "Your own route · 10 hrs · fuel and driver included"],
    point_to_point: ["Car with driver to other provinces", "Door to door · priced by distance, known before you book"],
    hourly_charter: ["Car with driver by the hour", "In Bangkok, 5 or 10 hours"],
    trust: "Every driver passes background and licence checks", from: "from", cta: "Get a quote", none: "No cars available for this service right now",
    pay: "Secure deposit", track: "Status updates on LINE", receipt: "Official receipt", privacy: "Privacy", all: "All services",
  },
} as const;

type Service = "airport_transfer" | "daily_charter" | "point_to_point" | "hourly_charter";

export async function generateMetadata({ params }: PageProps<"/l/[service]">): Promise<Metadata> {
  const s = (await params).service as Service;
  return { title: COPY.th[s]?.[0] ?? "เหมารถพร้อมคนขับ", description: COPY.th[s]?.[1] };
}

export default async function Landing({ params, searchParams }: PageProps<"/l/[service]">) {
  const service = (await params).service as Service;
  const lang = (await searchParams).lang === "en" ? "en" : "th";
  const t = COPY[lang];
  if (!(service in COPY.th) || service === ("trust" as string)) notFound();
  const published = (await getSetting<Record<string, unknown>>("landing_published")) ?? {};
  if (!published[service]) notFound();
  const { brand, tabs } = await loadCatalog(lang);
  const items = tabs.find((x) => x.serviceType === service)?.items ?? [];
  const [title, sub] = t[service];

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <header className="bg-navy px-5 pb-8 pt-5 text-white">
        <div className="flex items-center justify-between">
          <span className="text-xl font-bold">{lang === "th" ? brand.name_th : brand.name_en}</span>
          <Link href={`?lang=${lang === "th" ? "en" : "th"}`} className="rounded-lg border border-white/30 px-3 py-1 text-sm">{lang === "th" ? "EN" : "TH"}</Link>
        </div>
        <h1 className="mt-6 text-[1.7rem] font-bold leading-snug">{title}</h1>
        <p className="mt-2 text-white/85">{sub}</p>
        <p className="mt-3 flex items-center gap-2 text-sm text-amber-soft"><ShieldCheck className="h-5 w-5" />{t.trust}</p>
      </header>
      <main className="flex-1 space-y-3 px-5 py-5 pb-10">
        {items.length === 0 ? (
          <p className="rounded-[var(--radius-card)] border border-line bg-card px-4 py-8 text-center text-muted">{t.none}</p>
        ) : items.map((it) => (
          <div key={it.carType} className="flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-card p-4">
            <div className="flex-1">
              <div className="text-lg font-bold">{it.name}</div>
              <div className="text-sm text-muted">{it.sub}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted">{t.from}</div>
              <div className="text-xl font-bold">{formatBaht(it.fromSatang)}</div>
            </div>
          </div>
        ))}
        {items.length > 0 && <QuoteCta service={service} label={t.cta} className={`${btnPrimary} w-full py-4 text-lg`} />}
        <ul className="grid grid-cols-3 pt-4 text-center text-sm text-muted">
          <li className="flex flex-col items-center gap-1.5"><Card className="h-6 w-6 text-navy" />{t.pay}</li>
          <li className="flex flex-col items-center gap-1.5"><Pin className="h-6 w-6 text-navy" />{t.track}</li>
          <li className="flex flex-col items-center gap-1.5"><Receipt className="h-6 w-6 text-navy" />{t.receipt}</li>
        </ul>
        <p className="pt-6 text-center text-xs text-muted">
          <Link href="/" className="underline">{t.all}</Link> · <Link href="/privacy" className="underline">{t.privacy}</Link>
        </p>
      </main>
    </div>
  );
}
