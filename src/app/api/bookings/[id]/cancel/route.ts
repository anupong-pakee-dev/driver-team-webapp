import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { cancelBooking } from "@/services/bookings";

// §8.2 POST /api/bookings/{id}/cancel — ลูกค้ายกเลิกเอง · owner ยกเลิกในนามบริษัท/เที่ยวบินยกเลิก
const Body = z.strictObject({
  reason: z.string().trim().min(2).max(300),
  by: z.enum(["customer", "company", "flight_cancelled"]).default("customer"),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/cancel">) {
  try {
    const user = await requireUser(["customer", "corporate_customer", "owner"]);
    const { id } = await ctx.params;
    const b = Body.parse(await req.json());
    const by = user.role === "owner" ? b.by : "customer";
    return withIdempotency(req, user.id, `POST /bookings/${id}/cancel`, async () => ({
      status: 200, body: await cancelBooking(user, id, by, b.reason),
    }));
  } catch (e) {
    return errorResponse(e);
  }
}
