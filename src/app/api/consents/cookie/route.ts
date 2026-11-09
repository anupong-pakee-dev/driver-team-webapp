import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { currentUser } from "@/lib/auth";
import { SYSTEM, withTx } from "@/lib/db";
import { errorResponse } from "@/lib/errors";
import { clientIp, rateLimit } from "@/lib/rateLimit";
import { getSetting } from "@/lib/settings";

// FR-PDPA-05 / FR-ADS-10: บันทึกการยินยอม/ปฏิเสธ cookie การตลาดใน consents (เก็บเป็นประวัติ)
const Body = z.strictObject({ granted: z.boolean() });

export async function POST(req: NextRequest) {
  try {
    await rateLimit(`cookie:${clientIp(req)}`, 60, 60);
    const { granted } = Body.parse(await req.json());
    const jar = await cookies();
    const user = await currentUser();
    let anon = jar.get("aid")?.value ?? null;
    if (!anon) anon = randomUUID();
    const version = (await getSetting<{ customer_version: string }>("privacy_notice"))?.customer_version ?? "unknown";
    await withTx({ ...SYSTEM, reason: "cookie consent" }, (db) =>
      db.query(`insert into consents (user_id, anon_id, kind, version, granted, channel) values ($1, $2, 'marketing_tracking', $3, $4, 'web_cookie')`,
        [user?.id ?? null, anon, version, granted]));
    const opts = { sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: 180 * 86400 };
    jar.set("mc", granted ? "1" : "0", opts);
    // ไม่ยินยอม → ไม่เก็บ id ติดตามตัว
    if (granted) jar.set("aid", anon, { ...opts, httpOnly: true });
    else jar.delete("aid");
    return NextResponse.json({ granted });
  } catch (e) {
    return errorResponse(e);
  }
}
