import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { cancellationPreview } from "@/services/bookings";

// FR-BOOK-06 แสดงยอดคืนก่อนยืนยัน · ?by=company|flight_cancelled (owner)
export async function GET(req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/cancellation-preview">) {
  try {
    const user = await requireUser();
    const by = req.nextUrl.searchParams.get("by");
    const allowed = user.role === "owner" && (by === "company" || by === "flight_cancelled") ? by : "customer";
    return NextResponse.json(await cancellationPreview(user, (await ctx.params).id, allowed));
  } catch (e) {
    return errorResponse(e);
  }
}
