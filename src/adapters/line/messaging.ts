// §9.1 ส่งข้อความ LINE: reply (ไม่นับโควตา) / push (นับโควตา) · ห้ามใช้ LINE Notify
import { createHmac, timingSafeEqual } from "node:crypto";

const API = "https://api.line.me/v2/bot/message";

export type LineMessage = Record<string, unknown>;

async function call(path: string, body: unknown, retryKey?: string) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  const res = await fetch(`${API}/${path}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...(retryKey ? { "X-Line-Retry-Key": retryKey } : {}),
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`LINE ${path} ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** retryKey (UUID) กันส่งซ้ำเมื่อ worker retry */
export const push = (to: string, messages: LineMessage[], retryKey?: string) => call("push", { to, messages }, retryKey);
export const reply = (replyToken: string, messages: LineMessage[]) => call("reply", { replyToken, messages });

/** x-line-signature = base64(HMAC-SHA256(channel secret, raw body)) */
export function verifySignature(rawBody: string, signature: string | null, secret = process.env.LINE_CHANNEL_SECRET): boolean {
  if (!signature || !secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest();
  const given = Buffer.from(signature, "base64");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** โควตาข้อความ push ของเดือนนี้ (reply ไม่นับ) — limit null = แพ็กเกจไม่จำกัด/ไม่มีเพดาน */
export async function messageQuota(): Promise<{ limit: number | null; used: number }> {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("LINE_CHANNEL_ACCESS_TOKEN is not set");
  const get = async (path: string) => {
    const res = await fetch(`${API}/${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(5000) });
    if (!res.ok) throw new Error(`LINE ${path} ${res.status}`);
    return res.json();
  };
  const [q, c] = await Promise.all([get("quota"), get("quota/consumption")]) as [{ type: string; value?: number }, { totalUsage: number }];
  return { limit: q.type === "limited" ? q.value ?? null : null, used: c.totalUsage };
}
