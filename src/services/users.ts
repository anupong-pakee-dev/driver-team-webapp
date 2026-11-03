import "server-only";
import type { Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import type { LineIdentity } from "@/adapters/line/liffAuth";

// FR-CUST-01: login ผ่าน LINE ครั้งแรก = สร้างบัญชีลูกค้า · คนขับต้องถูกเชิญก่อน (FR-DRV-01, เฟส 2)

export async function upsertLineUser(db: Db, id: LineIdentity, app: "customer" | "driver") {
  const { rows } = await db.query(`select id, role, status from users where line_user_id = $1 for update`, [id.lineUserId]);
  const existing = rows[0];
  if (existing) {
    if (existing.status !== "active") throw new BizError("FORBIDDEN", { reason: "USER_NOT_ACTIVE" });
    if (app === "driver" && existing.role !== "driver") throw new BizError("FORBIDDEN", { reason: "NOT_A_DRIVER" });
    return existing.id as string;
  }
  if (app === "driver") throw new BizError("FORBIDDEN", { reason: "DRIVER_NOT_INVITED" });
  const { rows: created } = await db.query(
    `insert into users (auth_user_id, role, line_user_id, display_name) values (gen_random_uuid(), 'customer', $1, $2) returning id`,
    [id.lineUserId, id.name],
  );
  return created[0].id as string;
}
