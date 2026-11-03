import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { acceptQuote } from "@/services/bookings";

// §8.2 POST /api/quotes/{id}/accept — ลูกค้า (FR-BOOK-03, FR-PAY-01)
const Body = z.strictObject({
  terms_version: z.string().min(1).max(50),
  privacy_version: z.string().min(1).max(50),
  marketing_tracking: z.boolean(),
  vehicle_liability: z.boolean().optional(),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/quotes/[id]/accept">) {
  try {
    const user = await requireUser(["customer", "corporate_customer"]);
    const { id } = await ctx.params;
    const body = Body.parse(await req.json());
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    return withIdempotency(req, user.id, `POST /quotes/${id}/accept`, async () => ({
      status: 201, body: await acceptQuote(user, id, body, ip),
    }));
  } catch (e) {
    return errorResponse(e);
  }
}
