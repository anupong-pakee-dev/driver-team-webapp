import "server-only";
import type { SlipData } from "@/domain/slip";

// §9.2 adapter ข: อ่านข้อมูลสลิปจากผู้ให้บริการ API ตรวจสลิป
// ❓ T3 ยังไม่เลือกผู้ให้บริการ → ยังไม่ผูกกับเจ้าใด (ไม่เดารูปแบบ API)
//   - ไม่มีผู้ให้บริการ: คืน null → รายการไปรอแอดมิน/เจ้าของตรวจด้วยมือ (FR-PAY-03)
//   - local: รับ qr_payload จำลอง "DEVSLIP|<ref>|<amount_satang>|<receiver>|<ISO time>" เพื่อทดสอบกฎ BR-PAY-01

export class SlipProviderUnavailable extends Error {}

export async function readSlip(input: { image?: Blob; qrPayload?: string }): Promise<SlipData> {
  if (input.qrPayload?.startsWith("DEVSLIP|")) {
    if (process.env.NODE_ENV === "production") throw new SlipProviderUnavailable("dev slips disabled");
    const [, ref, amount, receiver, time] = input.qrPayload.split("|");
    const n = Number(amount);
    if (!ref || !Number.isSafeInteger(n) || !receiver || Number.isNaN(Date.parse(time))) throw new Error("bad dev slip");
    return { ref, amountSatang: n, receiverAccounts: [receiver], transferredAt: new Date(time) };
  }
  // ผู้ให้บริการจริงต่อที่นี่ (ใช้ SLIP_API_KEY) หลังเลือกเจ้าและอ่านเอกสารทางการ
  throw new SlipProviderUnavailable("no slip verification provider configured");
}
