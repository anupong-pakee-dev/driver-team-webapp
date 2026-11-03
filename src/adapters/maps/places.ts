import "server-only";

// §9.3 Places Autocomplete (New) ผ่านเซิร์ฟเวอร์ (key ไม่ออกไปฝั่ง browser)
// ไม่มี GOOGLE_MAPS_SERVER_KEY บน local → ใช้รายการสถานที่ตัวอย่าง (stub)

export type PlaceSuggestion = { place_id: string; name: string; secondary?: string };
export type PlaceDetail = { place_id: string; name: string; lat: number; lng: number };

const API = "https://places.googleapis.com/v1";
const key = () => process.env.GOOGLE_MAPS_SERVER_KEY;
export const mapsMode = () => (key() ? "google" : process.env.NODE_ENV === "production" ? "none" : "stub");

// ─── stub (local เท่านั้น) — พิกัดโดยประมาณ ───
export const STUB_PLACES: PlaceDetail[] = [
  { place_id: "stub:BKK", name: "ท่าอากาศยานสุวรรณภูมิ (BKK)", lat: 13.69, lng: 100.7501 },
  { place_id: "stub:DMK", name: "ท่าอากาศยานดอนเมือง (DMK)", lat: 13.9126, lng: 100.6068 },
  { place_id: "stub:siam", name: "สยามพารากอน", lat: 13.7462, lng: 100.5347 },
  { place_id: "stub:asok", name: "สุขุมวิท อโศก", lat: 13.737, lng: 100.5603 },
  { place_id: "stub:silom", name: "สีลม", lat: 13.729, lng: 100.534 },
  { place_id: "stub:khaosan", name: "ถนนข้าวสาร", lat: 13.7588, lng: 100.4973 },
  { place_id: "stub:pattaya", name: "พัทยา ชลบุรี", lat: 12.9236, lng: 100.8825 },
  { place_id: "stub:huahin", name: "หัวหิน ประจวบคีรีขันธ์", lat: 12.5684, lng: 99.9577 },
  { place_id: "stub:khaoyai", name: "เขาใหญ่ นครราชสีมา", lat: 14.4392, lng: 101.3722 },
  { place_id: "stub:ayutthaya", name: "อยุธยา", lat: 14.3532, lng: 100.5689 },
  { place_id: "stub:kanchanaburi", name: "กาญจนบุรี", lat: 14.0228, lng: 99.5328 },
];
export const AIRPORT_PLACE = { BKK: "stub:BKK", DMK: "stub:DMK" } as const;

export async function autocomplete(input: string, sessionToken: string): Promise<PlaceSuggestion[]> {
  const q = input.trim();
  if (q.length < 2) return [];
  if (mapsMode() === "stub") {
    return STUB_PLACES.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => ({ place_id: p.place_id, name: p.name }));
  }
  if (mapsMode() === "none") throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  const res = await fetch(`${API}/places:autocomplete`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Goog-Api-Key": key()! },
    body: JSON.stringify({ input: q, sessionToken, languageCode: "th", includedRegionCodes: ["th"] }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`places autocomplete ${res.status}`);
  const body = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId: string; structuredFormat?: { mainText?: { text: string }; secondaryText?: { text: string } }; text?: { text: string } } }[];
  };
  return (body.suggestions ?? []).flatMap((s) => {
    const p = s.placePrediction;
    if (!p) return [];
    return [{
      place_id: p.placeId,
      name: p.structuredFormat?.mainText?.text ?? p.text?.text ?? "",
      secondary: p.structuredFormat?.secondaryText?.text,
    }];
  });
}

/** ชื่อ + พิกัด จาก place_id (ไม่เชื่อชื่อ/พิกัดที่ client ส่งมา) */
export async function placeDetail(placeId: string, sessionToken?: string): Promise<PlaceDetail> {
  if (placeId.startsWith("stub:")) {
    const p = STUB_PLACES.find((x) => x.place_id === placeId);
    if (!p || mapsMode() !== "stub") throw new Error("unknown place");
    return p;
  }
  if (!key()) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  const url = `${API}/places/${encodeURIComponent(placeId)}?languageCode=th${sessionToken ? `&sessionToken=${encodeURIComponent(sessionToken)}` : ""}`;
  const res = await fetch(url, {
    headers: { "X-Goog-Api-Key": key()!, "X-Goog-FieldMask": "id,displayName,location" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`place details ${res.status}`);
  const b = (await res.json()) as { id: string; displayName?: { text: string }; location?: { latitude: number; longitude: number } };
  if (!b.location) throw new Error("place has no location");
  return { place_id: b.id, name: b.displayName?.text ?? "", lat: b.location.latitude, lng: b.location.longitude };
}
