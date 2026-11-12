import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";
import { setAcceptingJobs } from "@/services/dispatch";

// คนขับเปิด/ปิดรับงาน (แทนปฏิทิน)
const Body = z.strictObject({ on: z.boolean() });

export async function POST(req: NextRequest) {
  try {
    const driver = await requireUser(["driver"]);
    const { on } = Body.parse(await req.json());
    return NextResponse.json(await setAcceptingJobs(driver, on));
  } catch (e) {
    return errorResponse(e);
  }
}
