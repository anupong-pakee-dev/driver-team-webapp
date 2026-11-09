import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { withTx } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";
import { invalidateSettings } from "@/lib/settings";
import { invalidateCatalog } from "@/services/catalog";

// FR-ADMIN-02: เจ้าของแก้ค่าตั้งค่าได้ · ทุกการแก้ต้องมีเหตุผลและถูกบันทึก audit (trigger)

const Body = z.strictObject({ value: z.json(), reason: z.string().trim().min(3).max(500) });

export async function PUT(req: NextRequest, ctx: RouteContext<"/api/admin/settings/[key]">) {
  try {
    const user = await requireUser(["owner"]);
    const { key } = await ctx.params;
    const { value, reason } = Body.parse(await req.json());

    const row = await withTx({ userId: user.id, role: user.role, reason }, async (db) => {
      const { rows } = await db.query(
        `update settings set value = $2, updated_by = $3, updated_at = now() where key = $1 returning key, value, updated_at`,
        [key, JSON.stringify(value), user.id],
      );
      return rows[0];
    });
    if (!row) throw new BizError("NOT_FOUND");
    invalidateSettings();
    invalidateCatalog();
    return NextResponse.json(row);
  } catch (e) {
    return errorResponse(e);
  }
}
