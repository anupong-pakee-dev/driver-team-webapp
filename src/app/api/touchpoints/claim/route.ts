import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { claimTouchpoint } from "@/services/ads";

// §7.7 ข้อ 3: LIFF login สำเร็จ → ผูก touchpoint กับ user
const Body = z.strictObject({ touchpoint_id: z.uuid() });

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["customer", "corporate_customer"]);
    const b = Body.parse(await req.json());
    return NextResponse.json(await claimTouchpoint(user, b.touchpoint_id, (await cookies()).get("aid")?.value ?? null));
  } catch (e) {
    return errorResponse(e);
  }
}
