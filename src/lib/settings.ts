import "server-only";
import type { Db } from "./db";
import { pool } from "./db";

// ADR-10: กฎที่อาจเปลี่ยนอยู่ในตาราง settings (แก้ได้โดยไม่แก้โค้ด)

export type CatalogSettings = {
  tabs: { service_type: string; label_th: string; label_en: string; note_th: string; note_en: string }[];
  cars: Record<string, { name_th: string; name_en: string; seats?: number; seats_label?: string; luggage?: number; desc_th?: string; desc_en?: string }>;
  order: string[];
};

export type Brand = { name_th: string; name_en: string };

// อ่านจาก pool: cache สั้นๆ ต่อ process (NFR-03) — แก้ค่าแล้วล้างทันทีใน process นี้ (invalidateSettings)
// instance อื่นเห็นค่าใหม่ภายใน TTL · อ่านภายใน transaction (ส่ง db มา) ไม่ใช้ cache เสมอ
const TTL_MS = 10_000;
let cached: { at: number; value: Record<string, unknown> } | null = null;

export function invalidateSettings() {
  cached = null;
}

export async function getSettings(db?: Pick<Db, "query">): Promise<Record<string, unknown>> {
  if (!db && cached && Date.now() - cached.at < TTL_MS) return cached.value;
  const { rows } = await (db ?? pool).query(`select key, value from settings`);
  const value = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!db) cached = { at: Date.now(), value };
  return value;
}

export async function getSetting<T>(key: string, db?: Pick<Db, "query">): Promise<T | undefined> {
  return (await getSettings(db))[key] as T | undefined;
}
