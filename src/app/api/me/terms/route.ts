import { NextResponse, type NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { acceptDriverTerms } from "@/services/drivers";

// FR-DRV-04
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["driver"]);
    const { rows } = await pool.query(`select line_user_id from users where id = $1`, [user.id]);
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
    const terms = await acceptDriverTerms(user, { ip, lineUserId: rows[0]?.line_user_id ?? null });
    return NextResponse.json({ accepted: terms });
  } catch (e) {
    return errorResponse(e);
  }
}
