import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { tripStep } from "@/services/trip";

// §8.2 POST /api/bookings/{id}/status — คนขับ · multipart: to, lat, lng, accuracy_m, photo (บังคับ pickup/dropoff)
const Fields = z.strictObject({
  to: z.enum(["depart", "arrive", "pickup", "dropoff"]),
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
  accuracy_m: z.coerce.number().int().min(0).max(100_000).nullable(),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/status">) {
  try {
    const driver = await requireUser(["driver"]);
    const form = await req.formData();
    const f = Fields.parse({
      to: form.get("to"), lat: form.get("lat"), lng: form.get("lng"),
      accuracy_m: form.get("accuracy_m") ? Math.round(Number(form.get("accuracy_m"))) : null,
    });
    const photo = form.get("photo");
    if (photo !== null && !(photo instanceof File)) throw new BizError("VALIDATION", { photo: "file" });
    const p = photo && photo.size > 0 ? photo : null;
    return NextResponse.json(await tripStep(driver, (await ctx.params).id, f.to, { lat: f.lat, lng: f.lng, accuracy_m: f.accuracy_m }, p));
  } catch (e) {
    return errorResponse(e);
  }
}
