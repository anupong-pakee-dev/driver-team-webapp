// §8.1 รูปแบบ error เดียวทั้งระบบ
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { log } from "./redact";

type Def = { status: number; th: string; en: string };

export const ERRORS = {
  VALIDATION: { status: 400, th: "ข้อมูลไม่ถูกต้อง", en: "Invalid request" },
  UNAUTHENTICATED: { status: 401, th: "กรุณาเข้าสู่ระบบ", en: "Please sign in" },
  FORBIDDEN: { status: 403, th: "ไม่มีสิทธิ์", en: "Forbidden" },
  NOT_FOUND: { status: 404, th: "ไม่พบข้อมูล", en: "Not found" },
  INVALID_TRANSITION: { status: 409, th: "สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้", en: "Not allowed in current status" },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, th: "คำขอนี้กำลังดำเนินการ", en: "Request already in progress" },
  BUSINESS_RULE: { status: 422, th: "ไม่ผ่านเงื่อนไขของระบบ", en: "Business rule violated" },
  BELOW_FLOOR: { status: 422, th: "ราคาต่ำกว่าราคาขั้นต่ำ", en: "Price below floor" },
  NOT_ELIGIBLE: { status: 422, th: "คนขับหรือรถไม่ผ่านเงื่อนไข", en: "Driver or vehicle not eligible" },
  QUOTE_EXPIRED: { status: 422, th: "ใบเสนอราคาหมดอายุ", en: "Quote expired" },
  PAX_EXCEEDS_SEATS: { status: 422, th: "จำนวนผู้โดยสารเกินที่นั่ง", en: "Passengers exceed seats" },
  QUOTE_RULE: { status: 422, th: "ข้อมูลการเดินทางไม่ผ่านเงื่อนไข", en: "Trip details not accepted" },
  NO_PRICE_RULE: { status: 422, th: "ยังไม่มีราคาสำหรับบริการ/รถประเภทนี้", en: "No price for this service and car" },
  INVALID_DISCOUNT: { status: 422, th: "ส่วนลดไม่ถูกต้อง", en: "Invalid discount" },
  RATE_LIMITED: { status: 429, th: "ทำรายการถี่เกินไป", en: "Too many requests" },
  ROUTE_UNAVAILABLE: { status: 503, th: "คำนวณระยะทางไม่ได้ชั่วคราว แอดมินจะติดต่อกลับ", en: "Route service unavailable" },
  INTERNAL: { status: 500, th: "ระบบขัดข้อง", en: "Internal error" },
} satisfies Record<string, Def>;

export type ErrorCode = keyof typeof ERRORS;

export class BizError extends Error {
  constructor(public code: ErrorCode, public details: Record<string, unknown> = {}) {
    super(code);
  }
}

/** แปลง error จาก Postgres (SQLSTATE ที่ตั้งใน trigger) */
function fromPg(e: { code?: string; message?: string }): BizError | null {
  switch (e.code) {
    case "DT409": return new BizError("INVALID_TRANSITION");
    case "DT422": return new BizError("BUSINESS_RULE", { rule: e.message });
    case "DT403": return new BizError("FORBIDDEN", { rule: e.message });
    case "42501": return new BizError("FORBIDDEN");
    case "23P01": return new BizError("BUSINESS_RULE", { rule: "TIME_CONFLICT" });   // exclusion constraint
    case "23505": return new BizError("VALIDATION", { problem: "duplicate" });
    default: return null;
  }
}

export function errorResponse(err: unknown): NextResponse {
  let biz: BizError | null = null;
  if (err instanceof BizError) biz = err;
  else if (err instanceof ZodError) biz = new BizError("VALIDATION", { issues: err.issues.map((i) => ({ path: i.path, message: i.message })) });
  else if (err && typeof err === "object" && "code" in err) biz = fromPg(err as { code?: string; message?: string });

  if (!biz) {
    log.error("unhandled error", err);
    biz = new BizError("INTERNAL");
  }
  const def = ERRORS[biz.code];
  return NextResponse.json(
    { error: { code: biz.code, message_th: def.th, message_en: def.en, details: biz.details } },
    { status: def.status },
  );
}
