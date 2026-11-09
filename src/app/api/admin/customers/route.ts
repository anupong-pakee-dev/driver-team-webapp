import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { encryptField, normalizeThaiPhone, phoneHash } from "@/lib/crypto";
import { withTx } from "@/lib/db";
import { BizError, errorResponse } from "@/lib/errors";

// แอดมินเพิ่มลูกค้าที่ติดต่อทางโทรศัพท์/ไม่มี LINE เพื่อออกใบเสนอราคาแทน
// (ใช้เบอร์ที่ลูกค้าให้เองเพื่อการจองนี้ — ไม่นำเข้าเบอร์จากแหล่งอื่น §17)
const Body = z.strictObject({
  display_name: z.string().trim().min(1).max(60),
  full_name: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(9).max(20),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser(["sales_admin", "owner"]);
    const b = Body.parse(await req.json());
    const e164 = normalizeThaiPhone(b.phone);
    if (!e164) throw new BizError("VALIDATION", { field: "phone" });
    const id = await withTx({ userId: user.id, role: user.role, reason: "add customer" }, async (db) => {
      const dup = await db.query(`select id from users where phone_hash = $1 and role in ('customer','corporate_customer')`, [phoneHash(e164)]);
      if (dup.rows[0]) return dup.rows[0].id as string;
      const { rows } = await db.query(
        `insert into users (auth_user_id, role, display_name, full_name_enc, phone_enc, phone_hash)
         values (gen_random_uuid(), 'customer', $1, $2, $3, $4) returning id`,
        [b.display_name, encryptField(b.full_name), encryptField(e164), phoneHash(e164)],
      );
      return rows[0].id as string;
    });
    return NextResponse.json({ id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
