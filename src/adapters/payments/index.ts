import "server-only";
import QRCode from "qrcode";
import { promptPayPayload } from "@/domain/promptpay";
import { createPromptPayCharge } from "./omise";

// §9.2 PaymentAdapter — เลือกด้วย settings.payment_adapter ("slip" | "gateway") ⚙️ (T3)

export type AdapterName = "slip" | "gateway";

export type ChargeResult = {
  method: "slip" | "gateway";
  gatewayRef: string | null;     // Omise charge id
  expiresAt: Date;
  qrImageUrl: string | null;     // gateway: รูป QR จาก Omise
};

export async function createCharge(
  adapter: AdapterName,
  p: { paymentId: string; bookingId: string; amountSatang: number; windowMinutes: number },
): Promise<ChargeResult> {
  const expiresAt = new Date(Date.now() + p.windowMinutes * 60_000);
  if (adapter === "gateway") {
    const c = await createPromptPayCharge(p.amountSatang, { payment_id: p.paymentId, booking_id: p.bookingId });
    return {
      method: "gateway",
      gatewayRef: c.id,
      expiresAt: c.expires_at ? new Date(c.expires_at) : expiresAt,
      qrImageUrl: c.source?.scannable_code?.image?.download_uri ?? null,
    };
  }
  return { method: "slip", gatewayRef: null, expiresAt, qrImageUrl: null };
}

/** QR พร้อมเพย์บัญชีบริษัท (adapter ข) เป็น SVG data — สร้างใหม่ได้ทุกครั้งจากยอดเดิม */
export async function promptPaySvg(promptPayId: string, amountSatang: number): Promise<string> {
  return QRCode.toString(promptPayPayload(promptPayId, amountSatang), { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}
