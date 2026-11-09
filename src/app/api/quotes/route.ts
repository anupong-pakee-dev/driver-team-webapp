import { type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { withIdempotency } from "@/lib/idempotency";
import { createQuote } from "@/services/quotes";

// §8.2 POST /api/quotes — ลูกค้า, sales_admin, owner (FR-PRICE-01, QUOTE-01)
const PlaceId = z.string().min(3).max(300);
const Body = z.strictObject({
  customer_id: z.uuid().optional(),
  service_type: z.enum(["airport_transfer", "point_to_point", "hourly_charter", "daily_charter", "driver_only"]),
  car_type: z.enum(["sedan", "suv", "van", "van_vip", "mpv_premium", "driver_only"]),
  origin_place_id: PlaceId.optional(),
  destination_place_id: PlaceId.optional(),
  stop_place_ids: z.array(PlaceId).max(5).default([]),
  pickup_at: z.iso.datetime({ offset: true }),
  hours: z.number().int().min(1).max(24).nullable().optional(),
  pax: z.number().int().min(1).max(15),
  luggage: z.number().int().min(0).max(20),
  child_seats: z.number().int().min(0).max(4),
  flight: z.strictObject({
    no: z.string().trim().max(10).nullable().optional(),
    airport: z.enum(["BKK", "DMK"]),
    direction: z.enum(["arrival", "departure"]),
  }).nullable().optional(),
  no_flight: z.boolean().default(false),
  notes: z.string().trim().max(1000).nullable().optional(),
  source_answer: z.string().trim().max(50).nullable().optional(),
  session_token: z.string().max(100).optional(),
  manual: z.strictObject({ distance_km: z.number().min(0).max(3000), duration_min: z.number().min(0).max(6000) }).nullable().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["customer", "corporate_customer", "sales_admin", "owner"]);
    const body = Body.parse(await req.json());
    return withIdempotency(req, user.id, "POST /quotes", async () => ({ status: 201, body: await createQuote(user, body) }));
  } catch (e) {
    return errorResponse(e);
  }
}
