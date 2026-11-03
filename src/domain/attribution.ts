// §7.7 Attribution (FR-ADS-01..03) — กฎล้วน

export type AdPlatform = "meta" | "google" | "tiktok" | "gbp" | "offline" | "referral" | "direct" | "unknown";

export type ClickIds = { gclid?: string | null; fbclid?: string | null; ttclid?: string | null };

/** click id เก็บตามตัวพิมพ์เดิม (case-sensitive) · เลือกตัวแรกที่มี */
export function pickClickId(p: ClickIds): { type: "gclid" | "fbclid" | "ttclid"; id: string } | null {
  for (const type of ["gclid", "fbclid", "ttclid"] as const) {
    const v = p[type];
    if (v && v.length <= 500) return { type, id: v };
  }
  return null;
}

/** แพลตฟอร์มจาก click id / utm_source เมื่อไม่มีแคมเปญ */
export function platformFromParams(p: ClickIds & { utm_source?: string | null }): AdPlatform | null {
  if (p.gclid) return "google";
  if (p.fbclid) return "meta";
  if (p.ttclid) return "tiktok";
  const s = p.utm_source?.toLowerCase() ?? "";
  if (/facebook|instagram|meta|fb|ig/.test(s)) return "meta";
  if (/google|youtube/.test(s)) return "google";
  if (/tiktok/.test(s)) return "tiktok";
  if (/gbp|maps|business/.test(s)) return "gbp";
  return null;
}

/** คำตอบ "รู้จักเราจากไหน" → แพลตฟอร์ม (FR-ADS-03) */
export const SOURCE_ANSWER_PLATFORM: Record<string, AdPlatform> = {
  facebook: "meta", google: "google", tiktok: "tiktok", line: "direct", friend: "referral", repeat: "direct", other: "unknown",
};

/** ลำดับความเชื่อถือ: แคมเปญของ last touch → พารามิเตอร์ของ touch → คำตอบในฟอร์ม → unknown (ไม่มีค่าว่าง) */
export function resolveSource(i: {
  touchCampaignPlatform?: AdPlatform | null;
  touchParamsPlatform?: AdPlatform | null;
  sourceAnswer?: string | null;
}): AdPlatform {
  return i.touchCampaignPlatform ?? i.touchParamsPlatform ?? (i.sourceAnswer ? SOURCE_ANSWER_PLATFORM[i.sourceAnswer] : undefined) ?? "unknown";
}

/** slug แคมเปญ: a-z 0-9 - (ใช้ใน /go/{slug}) */
export const SLUG = /^[a-z0-9](?:[a-z0-9-]{0,48}[a-z0-9])?$/;
