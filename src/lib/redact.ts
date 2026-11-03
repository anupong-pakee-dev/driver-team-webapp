// §13.4 log ระบบต้องไม่มีเบอร์ ชื่อเต็ม พิกัด → กรองก่อนส่งออก console/Sentry

const SENSITIVE_KEYS = /^(phone|tel|mobile|full_?name|name_full|first_?name|last_?name|lat|lng|latitude|longitude|address|id_token|access_token|password|secret|authorization|cookie|bank_account|.*_enc)$/i;
const THAI_PHONE = /(\+66|\b0)[689]\d[- ]?\d{3}[- ]?\d{4}\b/g;
const BEARER = /Bearer\s+[A-Za-z0-9._~+/-]+=*/g;

export function redactString(s: string): string {
  return s.replace(THAI_PHONE, "[phone]").replace(BEARER, "Bearer [redacted]");
}

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[depth]";
  if (typeof value === "string") return redactString(value);
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (value instanceof Error) return { name: value.name, message: redactString(value.message) };
  if (value && typeof value === "object") {
    if (Buffer.isBuffer(value)) return "[bytes]";
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SENSITIVE_KEYS.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export const log = {
  info: (msg: string, data?: unknown) => console.log(redactString(msg), data === undefined ? "" : JSON.stringify(redact(data))),
  warn: (msg: string, data?: unknown) => console.warn(redactString(msg), data === undefined ? "" : JSON.stringify(redact(data))),
  error: (msg: string, data?: unknown) => console.error(redactString(msg), data === undefined ? "" : JSON.stringify(redact(data))),
};
