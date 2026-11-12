// FR-BOOK-01 ตำแหน่งจากลูกค้า (GPS / ปักหมุด / ลิงก์ Google Maps) — ไม่ใช้ API แผนที่ที่มีค่าใช้จ่าย
// ระยะทาง = ระยะเส้นตรงผ่านทุกจุดตามลำดับ × road_factor · เวลา = ระยะ ÷ avg_kmh (ราคาประมาณ แอดมินปรับได้)

export type LatLng = { lat: number; lng: number };
export type EstimateConfig = { road_factor: number; avg_kmh: number };
export const DEFAULT_ESTIMATE: EstimateConfig = { road_factor: 1.35, avg_kmh: 50 };

// กรอบประเทศไทยแบบหยาบ (กันพิกัดผิด/สลับ lat-lng)
const TH = { minLat: 5.5, maxLat: 20.6, minLng: 97.3, maxLng: 105.7 };
export const inThailand = (p: LatLng) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= TH.minLat && p.lat <= TH.maxLat && p.lng >= TH.minLng && p.lng <= TH.maxLng;

export function haversineM(a: LatLng, b: LatLng) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function estimateRoute(points: LatLng[], cfg: EstimateConfig = DEFAULT_ESTIMATE) {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineM(points[i - 1], points[i]) * cfg.road_factor;
  return { distanceM: Math.round(m), durationS: Math.round((m / 1000 / cfg.avg_kmh) * 3600) };
}

// ─── ลิงก์ Google Maps ───
// ลิงก์ย่อจากปุ่ม "แชร์" ในแอป (maps.app.goo.gl) ต้องให้เซิร์ฟเวอร์ตามไปหา URL เต็มก่อน
export const SHORT_MAPS_HOSTS = ["maps.app.goo.gl", "goo.gl"];
export const MAPS_HOSTS = [...SHORT_MAPS_HOSTS, "google.com", "www.google.com", "maps.google.com", "google.co.th", "www.google.co.th", "maps.google.co.th"];

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;
const PAIR = new RegExp(String.raw`^\s*(?:loc:)?\s*${NUM}\s*,\s*\+?\s*${NUM}\s*$`);

const pair = (s: string | null | undefined): LatLng | null => {
  const m = s ? PAIR.exec(s) : null;
  return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null;
};

/** พิกัดจากลิงก์ Google Maps แบบเต็ม หรือข้อความ "13.7462, 100.5347" — คืน null ถ้าไม่มีพิกัดในลิงก์ */
export function parseMapsLink(text: string): (LatLng & { name?: string }) | null {
  const raw = text.trim();
  const plain = pair(raw);
  if (plain) return plain;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  const host = u.hostname.toLowerCase();
  if (!MAPS_HOSTS.includes(host) || (!u.pathname.startsWith("/maps") && host.startsWith("www.google"))) return null;
  const path = decodeURIComponent(u.pathname);
  const place = /\/maps\/place\/([^/]+)/.exec(u.pathname)?.[1];
  const name = place ? decodeURIComponent(place.replace(/\+/g, " ")).trim() : undefined;
  const withName = (p: LatLng | null) => (p ? { ...p, ...(name && !pair(name) ? { name } : {}) } : null);

  // 1) หมุดของสถานที่ (!3d<lat>!4d<lng>) แม่นกว่าจุดกึ่งกลางแผนที่
  const pin = new RegExp(String.raw`!3d${NUM}!4d${NUM}`).exec(u.href);
  if (pin) return withName({ lat: Number(pin[1]), lng: Number(pin[2]) });
  // 2) พารามิเตอร์ที่เป็นพิกัด
  for (const k of ["q", "query", "ll", "destination", "daddr", "center"]) {
    const p = pair(u.searchParams.get(k));
    if (p) return withName(p);
  }
  // 3) /maps/search/13.7,+100.5 หรือ /maps/place/13.7,100.5
  const seg = /\/maps\/(?:search|place|dir)\/([^/]+)/.exec(path)?.[1];
  const p3 = pair(seg?.replace(/\+/g, " "));
  if (p3) return p3;
  // 4) จุดกึ่งกลางแผนที่ /@lat,lng,zoom
  const at = new RegExp(String.raw`/@${NUM},${NUM}`).exec(path);
  if (at) return withName({ lat: Number(at[1]), lng: Number(at[2]) });
  return null;
}

/** ลิงก์นำทางให้คนขับ — เปิดแอปในมือถือ ไม่ใช้ API key */
export const navLinks = (p: LatLng) => ({
  google: `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`,
  waze: `https://waze.com/ul?ll=${p.lat},${p.lng}&navigate=yes`,
});

// ───── ชื่อสถานที่จากผล reverse geocoding (OpenStreetMap Nominatim) ─────
export type NominatimReverse = {
  name?: string;
  address?: Record<string, string>;
};

/** ชื่อสั้นอ่านง่าย: ชื่อสถานที่ · ถนน · แขวง/ตำบล · เขต/อำเภอ · จังหวัด */
export function placeName(data: NominatimReverse): string | null {
  const a = data.address ?? {};
  const parts = [
    data.name,
    a.road,
    a.suburb ?? a.quarter ?? a.neighbourhood ?? a.village ?? a.hamlet,
    a.city_district ?? a.district ?? a.town ?? a.county,
    a.city ?? a.state ?? a.province,
  ].map((x) => x?.trim()).filter((x): x is string => !!x);
  const unique = parts.filter((x, i) => parts.indexOf(x) === i);
  if (!unique.length) return null;
  const s = unique.slice(0, 4).join(", ");
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}
