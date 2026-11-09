import { NextResponse, type NextRequest } from "next/server";
import { signedUrl } from "@/adapters/storage";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";

// §5.4 kyc-docs อ่านได้เฉพาะ owner ผ่าน signed URL ≤ 10 นาที
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/admin/documents/[id]/file">) {
  try {
    await requireUser(["owner"]);
    const { rows } = await pool.query(`select file_path from documents where id = $1`, [(await ctx.params).id]);
    if (!rows[0]) throw new BizError("NOT_FOUND");
    return NextResponse.redirect(await signedUrl("kyc-docs", rows[0].file_path, 600));
  } catch (e) {
    return errorResponse(e);
  }
}
