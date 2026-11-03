// §9.2 adapter ข: PromptPay QR ของบัญชีบริษัทพร้อมยอด (มาตรฐาน EMVCo / Thai QR Payment)
// BR-PAY-04: QR ชี้บัญชีบริษัทเท่านั้น — รับเลขพร้อมเพย์จาก settings.company

const tlv = (id: string, value: string) => `${id}${value.length.toString().padStart(2, "0")}${value}`;

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) */
export function crc16(s: string): string {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(s)) {
    crc ^= byte << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** เบอร์มือถือ 10 หลัก → 0066 + 9 หลัก · เลขผู้เสียภาษี/บัตรประชาชน 13 หลัก → ใช้ตรงๆ */
export function promptPayTarget(id: string): { tag: "01" | "02"; value: string } {
  const digits = id.replace(/\D/g, "");
  if (digits.length === 13) return { tag: "02", value: digits };
  if (digits.length === 10 && digits.startsWith("0")) return { tag: "01", value: `0066${digits.slice(1)}` };
  throw new Error("PromptPay id must be a 10-digit mobile or 13-digit tax id");
}

export function promptPayPayload(id: string, amountSatang: number): string {
  if (!Number.isSafeInteger(amountSatang) || amountSatang <= 0) throw new Error("amount must be positive satang");
  const t = promptPayTarget(id);
  const merchant = tlv("00", "A000000677010111") + tlv(t.tag, t.value);
  const body =
    tlv("00", "01") +
    tlv("01", "12") +                       // dynamic QR (มียอด ใช้ครั้งเดียว)
    tlv("29", merchant) +
    tlv("53", "764") +                      // THB
    tlv("54", (amountSatang / 100).toFixed(2)) +
    tlv("58", "TH") +
    "6304";
  return body + crc16(body);
}
