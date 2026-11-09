import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { errorResponse } from "@/lib/errors";

export async function GET() {
  try {
    const u = await requireUser();
    return NextResponse.json({ id: u.id, role: u.role, display_name: u.displayName, locale: u.locale });
  } catch (e) {
    return errorResponse(e);
  }
}
