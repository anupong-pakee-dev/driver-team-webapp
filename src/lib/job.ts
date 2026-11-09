import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { cronAuthorized } from "./cron";
import { pool } from "./db";
import { BizError, errorResponse } from "./errors";
import { log, redact } from "./redact";

/** route handler ของงานอัตโนมัติ (§10): ตรวจ CRON_SECRET + บันทึกผลทุกรอบลง job_runs (§14) */
export function jobRoute(name: string, run: (req: NextRequest) => Promise<unknown>) {
  return async (req: NextRequest) => {
    try {
      if (!cronAuthorized(req)) throw new BizError("UNAUTHENTICATED");
    } catch (e) {
      return errorResponse(e);
    }
    const t0 = Date.now();
    try {
      const result = await run(req);
      await recordRun(name, true, Date.now() - t0, result, null);
      log.info(`job ${name}`, result);
      return NextResponse.json(result);
    } catch (e) {
      await recordRun(name, false, Date.now() - t0, null, (e as Error).message);
      return errorResponse(e);
    }
  };
}

async function recordRun(name: string, ok: boolean, ms: number, result: unknown, error: string | null) {
  await pool.query(`insert into job_runs (name, ok, ms, result, error) values ($1, $2, $3, $4, $5)`,
    [name, ok, ms, result === null ? null : JSON.stringify(redact(result)), error?.slice(0, 500) ?? null]).catch(() => {});
}
