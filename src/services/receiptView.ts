import "server-only";
import { decryptField } from "@/lib/crypto";
import { pool, type Db } from "@/lib/db";
import type { ReceiptData } from "@/components/ReceiptView";

/** อ่านใบเสร็จผ่าน RLS (ลูกค้าเห็นเฉพาะของตัวเอง) แล้วเติมชื่อลูกค้าด้วยสิทธิ์เซิร์ฟเวอร์ */
export async function loadReceipt(db: Db, id: string): Promise<ReceiptData | null> {
  const { rows } = await db.query(
    `select r.number, r.issued_at, r.amount_satang::int, r.tax_category, r.is_tax_invoice,
            p.kind, p.method, b.service_type, b.car_type, b.pickup_at, q.number as quote_number, b.customer_id
       from receipts r join payments p on p.id = r.payment_id join bookings b on b.id = p.booking_id
       join quotes q on q.id = b.quote_id where r.id = $1`,
    [id],
  );
  const r = rows[0];
  if (!r) return null;
  const { rows: u } = await pool.query(`select full_name_enc from users where id = $1`, [r.customer_id]);
  return { ...r, customer_name: u[0]?.full_name_enc ? decryptField(u[0].full_name_enc) : null };
}
