import "server-only";
import { mapsMode, type PlaceDetail } from "./places";

// §9.3 Routes computeRoutes: ต้นทาง → จุดแวะ → ปลายทาง · ขอ field น้อยที่สุด (ไม่ใช้สภาพจราจร)
// stub (local): ระยะเส้นตรง × 1.35, ความเร็วเฉลี่ย 60 กม./ชม.

export type RouteResult = { distanceM: number; durationS: number };

function haversineM(a: PlaceDetail, b: PlaceDetail) {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function stubRoute(points: PlaceDetail[]): RouteResult {
  let m = 0;
  for (let i = 1; i < points.length; i++) m += haversineM(points[i - 1], points[i]) * 1.35;
  return { distanceM: Math.round(m), durationS: Math.round((m / 1000 / 60) * 3600) };
}

export async function computeRoute(points: PlaceDetail[]): Promise<RouteResult> {
  if (points.length < 2) return { distanceM: 0, durationS: 0 };
  if (mapsMode() === "stub") return stubRoute(points);
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  const wp = (p: PlaceDetail) => ({ placeId: p.place_id });
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
    },
    body: JSON.stringify({
      origin: wp(points[0]),
      destination: wp(points[points.length - 1]),
      intermediates: points.slice(1, -1).map(wp),
      travelMode: "DRIVE",
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`computeRoutes ${res.status}`);
  const b = (await res.json()) as { routes?: { distanceMeters?: number; duration?: string }[] };
  const r = b.routes?.[0];
  if (!r?.distanceMeters) throw new Error("no route");
  return { distanceM: r.distanceMeters, durationS: Number.parseInt(r.duration ?? "0", 10) };
}
