import "server-only";
import { placeName, type LatLng, type NominatimReverse } from "@/domain/geo";

// หาชื่อสถานที่จากพิกัด (reverse geocoding) และค้นหาสถานที่จากชื่อ ด้วย OpenStreetMap Nominatim — ฟรี ไม่ใช้ API key
// นโยบายการใช้งาน: ระบุตัวแอปใน User-Agent · ไม่เกิน 1 ครั้ง/วินาที · ไม่ใช้แบบพิมพ์แล้วค้นทุกตัวอักษร
// ใช้เฉพาะตอนลูกค้าตั้งจุด (กดครั้งเดียว) + จำผลไว้ในหน่วยความจำ · ล้มเหลว/ช้า → คืน null (ระบบแสดงพิกัดแทน)

const UA = "AveraTaxiThailand/1.0 (+https://avera-premium-24-hour-car-service.vercel.app)";
const cache = new Map<string, string | null>();
let last = 0;

/** เว้นระยะอย่างน้อย 1 วินาทีต่อเครื่อง (ตามนโยบาย Nominatim) */
async function throttle() {
  const wait = last + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export type PlaceHit = { lat: number; lng: number; name: string; detail: string };
const searchCache = new Map<string, PlaceHit[]>();

/**
 * ค้นหาสถานที่ในไทยจากชื่อ — เรียกเมื่อผู้ใช้กดค้นหาเท่านั้น (นโยบาย Nominatim ห้าม autocomplete)
 * คืนสูงสุด 6 รายการ · ล้มเหลว → [] (ผู้ใช้ยังเลื่อนแผนที่เองได้)
 */
export async function searchPlaces(q: string, lang = "th"): Promise<PlaceHit[]> {
  const key = `${lang}:${q.trim().toLowerCase()}`;
  if (searchCache.has(key)) return searchCache.get(key)!;
  await throttle();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.search = new URLSearchParams({
      q: q.trim(), format: "jsonv2", countrycodes: "th", limit: "6", addressdetails: "1",
      "accept-language": `${lang},th,en`,
    }).toString();
    const res = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const rows = (await res.json()) as (NominatimReverse & { lat: string; lon: string; display_name?: string })[];
    const hits = rows.map((r) => {
      const full = placeName(r) ?? r.display_name ?? "";
      const [name, ...rest] = full.split(", ");
      return { lat: Number(r.lat), lng: Number(r.lon), name: name || full, detail: rest.join(", ") };
    }).filter((h) => Number.isFinite(h.lat) && Number.isFinite(h.lng) && h.name);
    if (searchCache.size > 500) searchCache.clear();
    searchCache.set(key, hits);
    return hits;
  } catch {
    return [];
  }
}

export async function reverseGeocode(p: LatLng, lang = "th"): Promise<string | null> {
  const key = `${p.lat.toFixed(5)},${p.lng.toFixed(5)},${lang}`;
  if (cache.has(key)) return cache.get(key)!;
  await throttle();
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.search = new URLSearchParams({
      format: "jsonv2", lat: String(p.lat), lon: String(p.lng), zoom: "18", addressdetails: "1", "accept-language": lang,
    }).toString();
    const res = await fetch(url, { headers: { "user-agent": UA }, cache: "no-store", signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const name = placeName((await res.json()) as NominatimReverse);
    if (cache.size > 2000) cache.clear();
    cache.set(key, name);
    return name;
  } catch {
    return null;
  }
}
