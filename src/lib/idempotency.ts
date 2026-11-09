import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "./db";
import { BizError, errorResponse } from "./errors";

// P4: POST ที่สร้างเงิน/สถานะต้องมี Idempotency-Key · เก็บผลลัพธ์ 24 ชม. (ลบโดย idempotency_cleanup)

type Result = { status: number; body: unknown };

export async function withIdempotency(
  req: NextRequest,
  userId: string,
  route: string,
  fn: () => Promise<Result>,
): Promise<NextResponse> {
  const header = req.headers.get("idempotency-key");
  if (!header || header.length > 200) {
    return errorResponse(new BizError("VALIDATION", { header: "Idempotency-Key required" }));
  }
  const key = `${userId}:${route}:${header}`;

  const inserted = await pool.query(
    `insert into idempotency_keys (key, user_id, route) values ($1, $2, $3) on conflict (key) do nothing returning key`,
    [key, userId, route],
  );
  if (inserted.rowCount === 0) {
    const { rows } = await pool.query(`select response from idempotency_keys where key = $1`, [key]);
    const saved = rows[0]?.response as Result | null;
    if (!saved) return errorResponse(new BizError("IDEMPOTENCY_IN_PROGRESS"));
    return NextResponse.json(saved.body, { status: saved.status, headers: { "Idempotency-Replayed": "true" } });
  }

  try {
    const result = await fn();
    await pool.query(`update idempotency_keys set response = $2 where key = $1`, [key, result]);
    return NextResponse.json(result.body, { status: result.status });
  } catch (e) {
    // ไม่สำเร็จ → ปล่อยให้ลองใหม่ด้วย key เดิมได้
    await pool.query(`delete from idempotency_keys where key = $1`, [key]);
    return errorResponse(e);
  }
}
