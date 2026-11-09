import "server-only";
import { randomUUID } from "node:crypto";
import { ALLOWED_UPLOAD, MAX_UPLOAD_BYTES, upload } from "@/adapters/storage";
import { payoutItem, sumItems, type PayoutRules } from "@/domain/payout";
import type { SessionUser } from "@/lib/auth";
import { SYSTEM, withTx, type Actor, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { formatBaht } from "@/lib/money";
import { getSettings } from "@/lib/settings";
import { notifyUser } from "./bookings";

// FR-PAYOUT-01..03 · BR-PAYOUT-01/02 · §7.5 สถานะ held → ready (รอบรายวัน) → paid

export async function payoutRules(): Promise<PayoutRules & { whtUnset: boolean }> {
  const s = await getSettings();
  const w = (s.withholding ?? {}) as { rate?: number | null; base?: "gross" | "after_commission" };
  return {
    commissionRate: Number(s.commission_rate ?? 0.2),
    whtRate: w.rate ?? null,
    whtBase: w.base ?? "after_commission",
    commissionOnCancellation: s.commission_on_cancellation === true,
    penaltiesEnabled: s.penalties_enabled === true,
    whtUnset: w.rate === null || w.rate === undefined,
  };
}

/** งานที่ปล่อยเงินได้แล้วแต่ยังไม่อยู่ในรอบจ่าย (BR-PAYOUT-01) · มีข้อร้องเรียนเปิด → ไม่ปล่อย (BR-PAYOUT-02) */
export async function releasable(db: Pick<Db, "query">) {
  const { rows } = await db.query(
    `select b.id, b.driver_id, b.status, b.pickup_at, coalesce(b.driver_share_satang, 0)::bigint as share,
            coalesce((select sum(case when p.kind = 'refund' then -p.amount_satang else p.amount_satang end) from payments p
                       where p.booking_id = b.id and ((p.kind in ('deposit','balance') and p.status = 'verified')
                                                     or (p.kind = 'refund' and p.status in ('pending','refunded')))), 0)::bigint as paid,
            coalesce((select sum(amount_satang) from payments p where p.booking_id = b.id and p.kind = 'reimbursement' and p.status = 'verified'), 0)::bigint as reimburse
       from bookings b
      where b.driver_id is not null
        and not exists (select 1 from payout_items i where i.booking_id = b.id)
        and not exists (select 1 from complaints c where c.booking_id = b.id and c.status = 'open')
        and (b.status = 'completed' or (b.status in ('cancelled','no_show') and coalesce(b.driver_share_satang, 0) > 0))
      order by b.driver_id, b.pickup_at`);
  return rows as { id: string; driver_id: string; status: string; pickup_at: string; share: string; paid: string; reimburse: string }[];
}

/** สร้างรอบจ่าย (รายวัน ⚙️ หรือ owner กด) → payout สถานะ ready ต่อคนขับ */
export async function buildPayouts(actor: Actor = { ...SYSTEM, reason: "payout_build job" }) {
  const rules = await payoutRules();
  return withTx(actor, async (db) => {
    const rows = await releasable(db);
    const byDriver = new Map<string, typeof rows>();
    for (const r of rows) byDriver.set(r.driver_id, [...(byDriver.get(r.driver_id) ?? []), r]);
    const created: string[] = [];
    for (const [driverId, list] of byDriver) {
      const items = list.map((r) => ({
        bookingId: r.id,
        kind: (r.status === "completed" ? "job" : "cancellation") as "job" | "cancellation",
        calc: payoutItem(
          r.status === "completed"
            ? { kind: "job", grossSatang: Number(r.paid), reimburseSatang: Number(r.reimburse) }
            : { kind: "cancellation", grossSatang: Number(r.share) },
          rules),
      }));
      const t = sumItems(items.map((i) => i.calc));
      const { rows: p } = await db.query(
        `insert into payouts (driver_id, status, gross_satang, commission_satang, penalties_satang, withholding_satang, reimburse_satang)
         values ($1, 'ready', $2, $3, $4, $5, $6) returning id`,
        [driverId, t.gross, t.commission, t.penalties, t.withholding, t.reimburse]);
      for (const i of items) {
        await db.query(
          `insert into payout_items (payout_id, booking_id, kind, gross_satang, commission_satang, withholding_satang, penalties_satang, reimburse_satang)
           values ($1,$2,$3,$4,$5,$6,$7,$8)`,
          [p[0].id, i.bookingId, i.kind, i.calc.gross, i.calc.commission, i.calc.withholding, i.calc.penalties, i.calc.reimburse]);
      }
      created.push(p[0].id);
    }
    return { created: created.length, jobs: rows.length };
  });
}

/** FR-PAYOUT-03: owner โอนแล้ว + แนบหลักฐาน → paid → แจ้งคนขับ */
export async function markPayoutPaid(owner: SessionUser, payoutId: string, proof: File) {
  const ext = ALLOWED_UPLOAD[proof.type as keyof typeof ALLOWED_UPLOAD];
  if (!ext) throw new BizError("VALIDATION", { file: "type" });
  if (proof.size > MAX_UPLOAD_BYTES) throw new BizError("VALIDATION", { file: "size" });
  const path = `payouts/${payoutId}/${randomUUID()}.${ext}`;
  await upload("receipts", path, await proof.arrayBuffer(), proof.type);
  return withTx({ userId: owner.id, role: owner.role, reason: "payout transferred" }, async (db) => {
    const { rows } = await db.query(
      `update payouts set status = 'paid', paid_at = now(), proof_file_path = $2
        where id = $1 and status = 'ready' returning driver_id, net_satang`, [payoutId, path]);
    if (!rows[0]) throw new BizError("INVALID_TRANSITION");
    await notifyUser(db, rows[0].driver_id, `โอนค่างานแล้ว ${formatBaht(Number(rows[0].net_satang))} ✓ ดูรายละเอียดในแอป`, `payout-paid:${payoutId}`);
    return { status: "paid" };
  });
}
