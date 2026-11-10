// §8.1 รูปแบบ error เดียวทั้งระบบ
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { log } from "./redact";

type Def = { status: number; th: string; en: string; zh: string };

export const ERRORS = {
  VALIDATION: { status: 400, th: "ข้อมูลไม่ถูกต้อง", en: "Invalid request", zh: "数据无效" },
  UNAUTHENTICATED: { status: 401, th: "กรุณาเข้าสู่ระบบ", en: "Please sign in", zh: "请先登录" },
  FORBIDDEN: { status: 403, th: "ไม่มีสิทธิ์", en: "Forbidden", zh: "无权限" },
  NOT_FOUND: { status: 404, th: "ไม่พบข้อมูล", en: "Not found", zh: "未找到" },
  INVALID_TRANSITION: { status: 409, th: "สถานะปัจจุบันไม่อนุญาตให้ทำรายการนี้", en: "Not allowed in current status", zh: "当前状态不允许此操作" },
  IDEMPOTENCY_IN_PROGRESS: { status: 409, th: "คำขอนี้กำลังดำเนินการ", en: "Request already in progress", zh: "该请求正在处理中" },
  BUSINESS_RULE: { status: 422, th: "ไม่ผ่านเงื่อนไขของระบบ", en: "Business rule violated", zh: "不符合系统规则" },
  BELOW_FLOOR: { status: 422, th: "ราคาต่ำกว่าราคาขั้นต่ำ", en: "Price below floor", zh: "价格低于最低价" },
  NOT_ELIGIBLE: { status: 422, th: "คนขับหรือรถไม่ผ่านเงื่อนไข", en: "Driver or vehicle not eligible", zh: "司机或车辆不符合条件" },
  QUOTE_EXPIRED: { status: 422, th: "ใบเสนอราคาหมดอายุ", en: "Quote expired", zh: "报价单已过期" },
  PAX_EXCEEDS_SEATS: { status: 422, th: "จำนวนผู้โดยสารเกินที่นั่ง", en: "Passengers exceed seats", zh: "乘客人数超过座位数" },
  QUOTE_RULE: { status: 422, th: "ข้อมูลการเดินทางไม่ผ่านเงื่อนไข", en: "Trip details not accepted", zh: "行程信息不符合条件" },
  NO_PRICE_RULE: { status: 422, th: "ยังไม่มีราคาสำหรับบริการ/รถประเภทนี้", en: "No price for this service and car", zh: "该服务/车型暂无价格" },
  INVALID_DISCOUNT: { status: 422, th: "ส่วนลดไม่ถูกต้อง", en: "Invalid discount", zh: "折扣无效" },
  RATE_LIMITED: { status: 429, th: "ทำรายการถี่เกินไป", en: "Too many requests", zh: "操作过于频繁" },
  ROUTE_UNAVAILABLE: { status: 503, th: "คำนวณระยะทางไม่ได้ชั่วคราว แอดมินจะติดต่อกลับ", en: "Route service unavailable", zh: "暂时无法计算距离，工作人员会联系您" },
  INTERNAL: { status: 500, th: "ระบบขัดข้อง", en: "Internal error", zh: "系统故障" },
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
    { error: { code: biz.code, message_th: def.th, message_en: def.en, message_zh: def.zh, details: biz.details } },
    { status: def.status },
  );
}
