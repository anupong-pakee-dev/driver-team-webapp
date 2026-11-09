import "server-only";
import { MAPS_HOSTS, SHORT_MAPS_HOSTS, parseMapsLink, type LatLng } from "@/domain/geo";

// ลิงก์ย่อจากปุ่ม "แชร์" ของแอป Google Maps (maps.app.goo.gl/…) ไม่มีพิกัดในตัว → ตาม redirect ไปหา URL เต็ม
// ไม่ใช้ API key · ตามเฉพาะโดเมนของ Google (กัน SSRF) · สูงสุด 4 ทอด · ทอดละ 5 วินาที

export async function resolveMapsLink(text: string): Promise<(LatLng & { name?: string }) | null> {
  const direct = parseMapsLink(text);
  if (direct) return direct;
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (!SHORT_MAPS_HOSTS.includes(url.hostname.toLowerCase())) return null;

  for (let hop = 0; hop < 4; hop++) {
    if (url.protocol !== "https:" || !MAPS_HOSTS.includes(url.hostname.toLowerCase())) return null;
    const res = await fetch(url, {
      redirect: "manual",
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
      headers: { "user-agent": "Mozilla/5.0 (compatible; booking-link-resolver)" },
    });
    const location = res.headers.get("location");
    if (!location) return null;
    url = new URL(location, url);
    // หน้าขอความยินยอมคุกกี้ของ Google ห่อ URL จริงไว้ใน continue=
    if (url.hostname === "consent.google.com") {
      const next = url.searchParams.get("continue");
      if (!next) return null;
      url = new URL(next);
    }
    const p = parseMapsLink(url.href);
    if (p) return p;
  }
  return null;
}
