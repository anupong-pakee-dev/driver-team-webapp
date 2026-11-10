import "server-only";
import { localized, messages, type Locale } from "@/i18n";
import { asUser, pool } from "@/lib/db";
import { getSettings, type CatalogSettings } from "@/lib/settings";
import { carLabel, SERVICE_TYPES } from "./portal";

// ตัวเลือกในฟอร์มขอราคา: เฉพาะคู่ (บริการ, รถ) ที่มีราคา active · ลูกค้าเห็นเฉพาะที่มีรถพร้อม (FR-CAT-01)

export type FormCar = { car_type: string; label: string; seats?: number; luggage?: number; from_satang: number };
export type FormService = { service_type: string; label: string; cars: FormCar[]; hours: number[] };
export type QuoteFormOptions = { services: FormService[] };

export async function quoteFormOptions(forCustomer: boolean, locale: Locale = "th"): Promise<QuoteFormOptions> {
  const t = messages(locale);
  const s = await getSettings();
  const catalog = s.catalog as CatalogSettings;
  const hours = (s.charter_hours ?? {}) as Record<string, number[]>;
  const { rows: rules } = await pool.query(
    `select car_type, service_type, base_satang::int from price_rules
      where active_from <= now() and (active_to is null or active_to > now())`,
  );
  const available = forCustomer
    ? await asUser(null, async (db) => new Set((await db.query(
        `select service_type, car_type from catalog_available((now() at time zone 'Asia/Bangkok')::date)`,
      )).rows.map((r) => `${r.service_type}|${r.car_type}`)))
    : null;

  return {
    services: SERVICE_TYPES.map((svc) => ({
      service_type: svc.value,
      label: locale === "th" ? svc.label : t.service[svc.value] ?? svc.label,
      hours: hours[svc.value] ?? [],
      cars: rules
        .filter((r) => r.service_type === svc.value && (!available || available.has(`${r.service_type}|${r.car_type}`)))
        .map((r) => {
          const c = catalog.cars[r.car_type];
          return {
            car_type: r.car_type,
            label: (c && localized(c, "name", locale)) || (locale === "th" ? carLabel(r.car_type) : t.car[r.car_type] ?? r.car_type),
            seats: c?.seats, luggage: c?.luggage, from_satang: r.base_satang,
          };
        })
        .sort((a, b) => a.from_satang - b.from_satang),
    })).filter((s) => s.cars.length > 0),
  };
}
