import { payoutItem } from "@/domain/payout";
import { requireStaffPage } from "@/lib/auth";
import { asUser, pool } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { payoutRules, releasable } from "@/services/payouts";
import { Badge, Empty, Panel } from "@/components/ui";
import { BuildPayouts, PayoutPaid } from "./actions";

// FR-PAYOUT-01..03 · BR-PAYOUT-01/02
export default async function PayoutsPage() {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const isOwner = user.role === "owner";
  const rules = await payoutRules();
  const [pending, held, payouts] = await Promise.all([
    releasable(pool),
    pool.query(
      `select b.id, b.status, b.pickup_at, u.display_name from bookings b join users u on u.id = b.driver_id
        where b.driver_id is not null and not exists (select 1 from payout_items i where i.booking_id = b.id)
          and (b.status = 'disputed' or (b.status = 'completed' and exists (select 1 from complaints c where c.booking_id = b.id and c.status = 'open')))`),
    asUser(user.authUserId, async (db) => (await db.query(
      `select p.id, p.status, p.created_at, p.paid_at, p.gross_satang::int, p.commission_satang::int, p.withholding_satang::int,
              p.penalties_satang::int, p.reimburse_satang::int, p.net_satang::int, p.proof_file_path is not null as has_proof,
              u.display_name, d.bank_account_last4,
              (select json_agg(json_build_object('booking', i.booking_id, 'kind', i.kind, 'gross', i.gross_satang, 'net',
                       i.gross_satang - i.commission_satang - i.withholding_satang - i.penalties_satang + i.reimburse_satang)) from payout_items i where i.payout_id = p.id) as items
         from payouts p join users u on u.id = p.driver_id join drivers d on d.user_id = p.driver_id
        order by (p.status = 'ready') desc, p.created_at desc limit 100`)).rows),
  ]);
  const names = new Map((await pool.query(`select id, display_name from users where id = any($1)`, [pending.map((p) => p.driver_id)])).rows.map((r) => [r.id, r.display_name]));
  const ready = payouts.filter((p) => p.status === "ready");
  const paid = payouts.filter((p) => p.status === "paid");

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">จ่ายเงินคนขับ</h1>
      {rules.whtUnset && (
        <p className="rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn">
          ยังไม่ได้ตั้งอัตราหัก ณ ที่จ่าย (settings: withholding.rate) — ตอนนี้คิดเป็น 0 ❓ รอนักบัญชี (T2)
        </p>
      )}

      <Panel title={`พร้อมเข้ารอบจ่าย (${pending.length} งาน)`}>
        {pending.length === 0 ? <Empty>ไม่มีงานรอเข้ารอบ</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {pending.map((r) => {
              const it = payoutItem(r.status === "completed"
                ? { kind: "job", grossSatang: Number(r.paid), reimburseSatang: Number(r.reimburse) }
                : { kind: "cancellation", grossSatang: Number(r.share) }, rules);
              return (
                <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>{names.get(r.driver_id)} · {formatBangkok(r.pickup_at)} · {r.status === "completed" ? "งาน" : "ส่วนแบ่งจากการยกเลิก"}</span>
                  <span>ค่างาน {formatBaht(it.gross)} − คอม {formatBaht(it.commission)} − หัก {formatBaht(it.withholding)} = <b>{formatBaht(it.net)}</b></span>
                </li>
              );
            })}
          </ul>
        )}
        {isOwner && pending.length > 0 && <div className="mt-3"><BuildPayouts /></div>}
        <p className="mt-2 text-xs text-muted">ระบบสร้างรอบอัตโนมัติทุกวัน (job payout_build) · ปล่อยเงินเมื่อลูกค้ายืนยันจบงาน หรือ 24 ชม. หลังส่งโดยไม่มีร้องเรียน</p>
      </Panel>

      {held.rows.length > 0 && (
        <Panel title={`พักเงิน — มีข้อร้องเรียน (${held.rows.length})`}>
          <ul className="space-y-1 text-sm">
            {held.rows.map((h) => <li key={h.id}><a className="text-navy underline" href={`/admin/bookings/${h.id}`}>{h.display_name} · {formatBangkok(h.pickup_at)}</a></li>)}
          </ul>
        </Panel>
      )}

      <Panel title={`รอโอน (${ready.length})`}>
        {ready.length === 0 ? <Empty>ไม่มีรายการรอโอน</Empty> : (
          <ul className="divide-y divide-line">
            {ready.map((p) => (
              <li key={p.id} className="space-y-2 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{p.display_name} · บัญชี xxx-{p.bank_account_last4 ?? "????"}</span>
                  <span className="text-lg font-bold">{formatBaht(p.net_satang)}</span>
                </div>
                <div className="text-xs text-muted">
                  {p.items?.length ?? 0} รายการ · ค่างาน {formatBaht(p.gross_satang)} · คอม {formatBaht(p.commission_satang)} · หัก ณ ที่จ่าย {formatBaht(p.withholding_satang)}
                  {p.penalties_satang > 0 && ` · ค่าปรับ ${formatBaht(p.penalties_satang)}`} · เบิกคืน {formatBaht(p.reimburse_satang)}
                </div>
                {isOwner && <PayoutPaid payoutId={p.id} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="โอนแล้ว (ล่าสุด)">
        {paid.length === 0 ? <Empty>ยังไม่มี</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {paid.map((p) => (
              <li key={p.id} className="flex flex-wrap justify-between gap-2 py-2">
                <span>{p.display_name} · {p.items?.length ?? 0} รายการ</span>
                <span>{formatBaht(p.net_satang)} · <Badge tone="ok">โอนแล้ว {p.paid_at && formatBangkok(p.paid_at)}</Badge></span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
