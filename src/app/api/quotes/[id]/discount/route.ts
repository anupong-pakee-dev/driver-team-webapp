import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { applyDiscount } from "@/services/quotes";

// FR-QUOTE-02 · §8.2 POST /api/quotes/{id}/discount
const Body = z.strictObject({ discount_satang: z.number().int().min(0), reason: z.string().trim().min(3).max(300) });

export async function POST(req: NextRequest, ctx: RouteContext<"/api/quotes/[id]/discount">) {
  try {
    const user = await requireUser(["sales_admin", "owner"]);
    const { id } = await ctx.params;
    const b = Body.parse(await req.json());
    return withIdempotency(req, user.id, `POST /quotes/${id}/discount`, async () => ({
      status: 200, body: await applyDiscount(user, id, b.discount_satang, b.reason),
    }));
  } catch (e) {
    return errorResponse(e);
  }
}
