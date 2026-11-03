import { NextResponse, type NextRequest } from "next/server";
import { log } from "@/lib/redact";
import { handleOmiseCharge } from "@/services/bookings";

// §8.2 Omise webhook: รับ event → ดึง charge จาก Omise ด้วย id (ไม่เชื่อ body) → ยอดตรง → verified → confirmed
// event ซ้ำ → 200 ไม่ทำซ้ำ (markVerified idempotent)
export async function POST(req: NextRequest) {
  let chargeId: string | undefined;
  try {
    const event = (await req.json()) as { key?: string; data?: { object?: string; id?: string } };
    if (event.data?.object === "charge") chargeId = event.data.id;
  } catch {
    return NextResponse.json({ ok: true });
  }
  if (!chargeId) return NextResponse.json({ ok: true });
  try {
    return NextResponse.json(await handleOmiseCharge(chargeId));
  } catch (e) {
    // ให้ Omise ส่งซ้ำ
    log.error("omise webhook failed", { error: (e as Error).message });
    return NextResponse.json({ error: "retry" }, { status: 500 });
  }
}
