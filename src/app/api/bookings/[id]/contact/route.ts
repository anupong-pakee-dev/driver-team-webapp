import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { revealContact } from "@/services/trip";

// §5.3 GET /api/bookings/{id}/contact — คนขับ · นอกเวลา 403 + audit (FR-FRAUD-01)
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/contact">) {
  try {
    const driver = await requireUser(["driver"]);
    return NextResponse.json(await revealContact(driver, (await ctx.params).id), { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}
