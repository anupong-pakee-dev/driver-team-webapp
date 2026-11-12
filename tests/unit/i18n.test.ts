import { describe, expect, it } from "vitest";
import { apiErrorText, localized, messages, negotiate, pickLocale, LOCALES } from "@/i18n";
import { ERRORS } from "@/lib/errors";

// โครงของพจนานุกรม: key ซ้อน, ความยาว array, จำนวนพารามิเตอร์ของฟังก์ชัน ต้องเหมือนกันทุกภาษา
function shape(v: unknown): unknown {
  if (typeof v === "function") return `fn/${v.length}`;
  if (Array.isArray(v)) return v.map(shape);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])]));
  return typeof v;
}

function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}

describe("dictionaries", () => {
  it("have the same keys, list lengths and function arity in every language", () => {
    const th = shape(messages("th"));
    for (const l of LOCALES) expect(shape(messages(l))).toEqual(th);
  });

  it("have no empty strings (except the optional legal banners: draft notice, Thai-only official note)", () => {
    for (const l of LOCALES) {
      const m = messages(l);
      // ป้าย "ฉบับร่าง" ว่างได้ทุกภาษาหลังเผยแพร่ฉบับจริง · หมายเหตุ "ฉบับไทยมีผลบังคับ" ว่างในภาษาไทย
      const legal = Object.fromEntries(Object.entries(m.legal).filter(([k]) => k !== "draft" && k !== "officialNote"));
      const empty = strings({ ...m, legal }).filter((s) => s.trim() === "");
      expect(empty).toEqual([]);
      if (l !== "th") expect(m.legal.officialNote.trim()).not.toBe("");
    }
  });

  it("are actually translated: no Thai script in English or Chinese", () => {
    for (const l of ["en", "zh"] as const) {
      expect(strings(messages(l)).filter((s) => /[฀-๿]/.test(s))).toEqual([]);
    }
  });

  it("interpolate values", () => {
    expect(messages("en").line.confirmed("500฿", "1 Dec", "https://x")).toContain("500฿");
    expect(messages("zh").quoteForm.stop(2)).toBe("途经点 2");
  });

  it("cover every API error in Chinese", () => {
    for (const [code, def] of Object.entries(ERRORS)) expect(def.zh, code).toBeTruthy();
  });
});

describe("language detection", () => {
  it("maps LINE / browser language tags to supported locales", () => {
    expect(pickLocale("zh-TW")).toBe("zh");
    expect(pickLocale("zh_CN")).toBe("zh");
    expect(pickLocale("en-US")).toBe("en");
    expect(pickLocale("th")).toBe("th");
    expect(pickLocale("ja")).toBeNull();
    expect(pickLocale(undefined)).toBeNull();
  });

  it("negotiates Accept-Language by quality", () => {
    expect(negotiate("ja;q=1,zh-CN;q=0.9,en;q=0.8")).toBe("zh");
    expect(negotiate("en;q=0.5,th;q=0.9")).toBe("th");
    expect(negotiate("fr,de")).toBeNull();
    expect(negotiate(null)).toBeNull();
  });

  it("falls back to English, then Thai, for settings names", () => {
    const car = { name_th: "รถเก๋ง", name_en: "Sedan" };
    expect(localized(car, "name", "zh")).toBe("Sedan");
    expect(localized({ ...car, name_zh: "轿车" }, "name", "zh")).toBe("轿车");
    expect(localized({ name_th: "รถเก๋ง" }, "name", "en")).toBe("รถเก๋ง");
    expect(localized(car, "name", "th")).toBe("รถเก๋ง");
  });

  it("picks the API error message for the language", () => {
    const body = { error: { message_th: "ไทย", message_en: "English", message_zh: "中文" } };
    expect(apiErrorText(body, "zh")).toBe("中文");
    expect(apiErrorText({ error: { message_th: "ไทย", message_en: "English" } }, "zh")).toBe("English");
    expect(apiErrorText(null, "en")).toBeUndefined();
  });
});
