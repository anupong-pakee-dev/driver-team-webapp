import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { startSession } from "@/lib/auth";
import { pool } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev";
import { BizError, errorResponse } from "@/lib/errors";

const Body = z.strictObject({ user_id: z.uuid() });

export async function POST(req: NextRequest) {
  try {
    if (!devLoginEnabled()) throw new BizError("NOT_FOUND");
    const { user_id } = Body.parse(await req.json());
    const { rows } = await pool.query(
      `select id from users where id = $1 and status = 'active' and role in ('customer','corporate_customer','driver')`,
      [user_id],
    );
    if (!rows[0]) throw new BizError("NOT_FOUND");
    await startSession(rows[0].id, "dev");
    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
