import "server-only";
import { asUser, pool } from "@/lib/db";
import type { Brand, CatalogSettings } from "@/lib/settings";

// FR-CAT-01: ราคาเริ่มต้นต่อประเภทรถ/บริการ จาก price_rules ที่ active
//            แสดงเฉพาะประเภทที่มีรถ+คนขับ eligible ≥ 1 ณ วันนี้ (catalog_available)
// BR-PRICE-04: "เริ่ม" = base ซึ่งเป็นราคาต่ำสุดที่ขายจริง (ระยะ/เวลาที่รวมแล้ว)

export type CatalogItem = {
  carType: string;
  name: string;
  sub: string;
  fromSatang: number;
  toSatang: number;
};
export type CatalogTab = { serviceType: string; label: string; note: string; items: CatalogItem[] };

// หน้าสาธารณะที่ traffic สูงสุด (แอด) → cache 15 วินาทีต่อ process (NFR-03)
// แก้ราคา/ตั้งค่าใน process นี้ล้างทันที · instance อื่นเห็นภายใน 15 วินาที · ความพร้อมของรถ (เอกสาร) เปลี่ยนไม่บ่อย
const TTL_MS = 15_000;
const cache = new Map<string, { at: number; value: { brand: Brand; tabs: CatalogTab[] } }>();
export function invalidateCatalog() {
  cache.clear();
}

export async function loadCatalog(locale: "th" | "en" = "th"): Promise<{ brand: Brand; tabs: CatalogTab[] }> {
  const hit = cache.get(locale);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const value = await loadCatalogFresh(locale);
  cache.set(locale, { at: Date.now(), value });
  return value;
}

async function loadCatalogFresh(locale: "th" | "en"): Promise<{ brand: Brand; tabs: CatalogTab[] }> {
  // settings ไม่เปิดให้ anon → อ่านด้วยสิทธิ์ server เฉพาะ 2 key ที่เป็นข้อมูลสาธารณะ
  const { rows: s } = await pool.query(`select key, value from settings where key in ('catalog','brand')`);
  const catalog = s.find((r) => r.key === "catalog")?.value as CatalogSettings;
  const brand = s.find((r) => r.key === "brand")?.value as Brand;

  // ราคา + ประเภทที่พร้อมขาย อ่านในนาม anon ผ่าน RLS เหมือนผู้เข้าชมทั่วไป
  const { rules, available } = await asUser(null, async (db) => {
    const { rows } = await db.query<{ car_type: string; service_type: string; from_satang: string; to_satang: string }>(
      `select car_type, service_type, min(base_satang) as from_satang, max(base_satang) as to_satang
         from price_rules
        where active_from <= now() and (active_to is null or active_to > now())
        group by car_type, service_type`,
    );
    const avail = await db.query<{ service_type: string; car_type: string }>(
      `select service_type, car_type from catalog_available((now() at time zone 'Asia/Bangkok')::date)`,
    );
    return { rules: rows, available: new Set(avail.rows.map((a) => `${a.service_type}|${a.car_type}`)) };
  });

  const th = locale === "th";
  const tabs = catalog.tabs.map((t) => ({
    serviceType: t.service_type,
    label: th ? t.label_th : t.label_en,
    note: th ? t.note_th : t.note_en,
    items: catalog.order.flatMap((carType) => {
      const r = rules.find((x) => x.car_type === carType && x.service_type === t.service_type);
      const car = catalog.cars[carType];
      if (!r || !car || !available.has(`${t.service_type}|${carType}`)) return [];
      const sub = car.seats
        ? th
          ? `${car.seats_label ?? car.seats} ที่นั่ง · ${car.luggage} กระเป๋า`
          : `${car.seats_label ?? car.seats} seats · ${car.luggage} bags`
        : (th ? car.desc_th : car.desc_en) ?? "";
      return [{ carType, name: th ? car.name_th : car.name_en, sub, fromSatang: Number(r.from_satang), toSatang: Number(r.to_satang) }];
    }),
  }));
  return { brand, tabs };
}
