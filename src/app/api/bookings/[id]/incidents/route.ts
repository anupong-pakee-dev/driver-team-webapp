import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { BizError, errorResponse } from "@/lib/errors";
import { reportIncident } from "@/services/trip";

// FR-TRIP-05 — คนขับของงาน, owner · multipart: type, description, actions?, photo? (บังคับเมื่อ no_show)
const Fields = z.strictObject({
  type: z.enum(["accident", "breakdown", "no_show", "lost_item", "safety", "other"]),
  description: z.string().trim().min(3).max(2000),
  actions: z.string().trim().max(2000).nullable(),
});

export async function POST(req: NextRequest, ctx: RouteContext<"/api/bookings/[id]/incidents">) {
  try {
    const user = await requireUser(["driver", "owner"]);
    const form = await req.formData();
    const f = Fields.parse({ type: form.get("type"), description: form.get("description"), actions: form.get("actions") || null });
    const photo = form.get("photo");
    if (photo !== null && !(photo instanceof File)) throw new BizError("VALIDATION", { photo: "file" });
    return NextResponse.json(await reportIncident(user, (await ctx.params).id, f, photo && photo.size > 0 ? photo : null), { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
