import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { buildPayouts } from "@/services/payouts";

// FR-PAYOUT-02: owner สร้างรอบจ่ายเอง (นอกจาก job รายวัน)
export async function POST() {
  try {
    const owner = await requireUser(["owner"]);
    return NextResponse.json(await buildPayouts({ userId: owner.id, role: owner.role, reason: "build payouts (manual)" }));
  } catch (e) {
    return errorResponse(e);
  }
}
