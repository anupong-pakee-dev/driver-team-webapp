import "server-only";

// §9.2 adapter ก: Omise PromptPay — สร้าง charge ฝั่งเซิร์ฟเวอร์ → QR · ยืนยันด้วยการดึง charge (ไม่เชื่อ body ของ webhook)
// ❓ T4 อายุ QR / การคืนเงิน PromptPay — ตรวจเอกสาร Omise ก่อนเปิดใช้จริง (ยังไม่ได้ทดสอบกับบัญชีจริง)

const API = "https://api.omise.co";

function auth() {
  const key = process.env.OMISE_SECRET_KEY;
  if (!key) throw new Error("OMISE_SECRET_KEY is not set");
  return `Basic ${Buffer.from(`${key}:`).toString("base64")}`;
}

export type OmiseCharge = {
  id: string;
  status: "pending" | "successful" | "failed" | "expired" | "reversed";
  amount: number;
  currency: string;
  expires_at?: string;
  metadata?: Record<string, string>;
  source?: { scannable_code?: { image?: { download_uri?: string } } };
};

export async function createPromptPayCharge(amountSatang: number, metadata: Record<string, string>): Promise<OmiseCharge> {
  const body = new URLSearchParams({ amount: String(amountSatang), currency: "thb", "source[type]": "promptpay" });
  for (const [k, v] of Object.entries(metadata)) body.set(`metadata[${k}]`, v);
  const res = await fetch(`${API}/charges`, {
    method: "POST",
    headers: { authorization: auth(), "content-type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`omise create charge ${res.status}`);
  return (await res.json()) as OmiseCharge;
}

export async function getCharge(id: string): Promise<OmiseCharge> {
  if (!/^chrg_[A-Za-z0-9_]+$/.test(id)) throw new Error("bad charge id");
  const res = await fetch(`${API}/charges/${id}`, { headers: { authorization: auth() }, cache: "no-store" });
  if (!res.ok) throw new Error(`omise get charge ${res.status}`);
  return (await res.json()) as OmiseCharge;
}
