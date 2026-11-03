import { NextResponse, type NextRequest } from "next/server";
import { signedUrl } from "@/adapters/storage";
import { requireUser } from "@/lib/auth";
import { pool } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";

// เปิดไฟล์ผ่าน signed URL ≤ 10 นาที — staff เท่านั้น
//   ?payment=<id>&kind=slip|proof (bucket receipts) · ?checkin=<id> / ?incident=<id> (bucket checkins)
export async function GET(req: NextRequest) {
  try {
    await requireUser(["sales_admin", "owner"]);
    const sp = req.nextUrl.searchParams;
    if (sp.get("checkin") || sp.get("incident")) {
      const { rows } = sp.get("checkin")
        ? await pool.query(`select photo_path as p from checkins where id = $1`, [sp.get("checkin")])
        : await pool.query(`select photo_path as p from incidents where id = $1`, [sp.get("incident")]);
      if (!rows[0]?.p) throw new BizError("NOT_FOUND");
      return NextResponse.redirect(await signedUrl("checkins", rows[0].p, 600));
    }
    const id = sp.get("payment") ?? "";
    const kind = sp.get("kind");
    const { rows } = await pool.query(`select slip_file_path, proof_file_path from payments where id = $1`, [id]);
    const path = kind === "proof" ? rows[0]?.proof_file_path : rows[0]?.slip_file_path;
    if (!path) throw new BizError("NOT_FOUND");
    return NextResponse.redirect(await signedUrl("receipts", path, 600));
  } catch (e) {
    return errorResponse(e);
  }
}
