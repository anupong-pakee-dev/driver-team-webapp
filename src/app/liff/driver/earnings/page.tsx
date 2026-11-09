import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { Badge, Empty, Panel } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "../shell";
import { driverPage } from "../session";

export const dynamic = "force-dynamic";

const STATUS = { held: ["พักไว้", "warn"], ready: ["รอโอน", "info"], paid: ["โอนแล้ว", "ok"], cancelled: ["ยกเลิก", "bad"] } as const;

// FR-DRV-08: งาน ยอด ค่าคอม หัก ณ ที่จ่าย เบิกคืน วันที่จ่าย (ข้อมูลจริงเกิดในเฟส 6)
export default async function DriverEarnings() {
  const { user, notDriver } = await driverPage();
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;

  const payouts = await asUser(user.authUserId, async (db) => (await db.query(
    `select p.id, p.status, p.gross_satang, p.commission_satang, p.withholding_satang, p.penalties_satang,
            p.reimburse_satang, p.net_satang, p.paid_at, p.created_at,
            (select count(*) from payout_items i where i.payout_id = p.id)::int as jobs
       from payouts p order by p.created_at desc limit 50`,
  )).rows);

  return (
    <DriverShell title="รายได้" active="earnings">
      {payouts.length === 0 ? (
        <Panel><Empty>ยังไม่มีรายได้ — จะแสดงหลังจบงานแรก</Empty></Panel>
      ) : (
        payouts.map((p) => {
          const s = STATUS[p.status as keyof typeof STATUS];
          const n = (x: string) => formatBaht(Number(x));
          return (
            <Panel key={p.id}>
              <div className="flex items-center justify-between">
                <span className="font-medium">{p.jobs} งาน · {formatBangkok(p.created_at)}</span>
                <Badge tone={s[1]}>{s[0]}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-muted">ค่างาน</dt><dd className="text-right">{n(p.gross_satang)}</dd>
                <dt className="text-muted">ค่าคอมมิชชั่น</dt><dd className="text-right">−{n(p.commission_satang)}</dd>
                <dt className="text-muted">หัก ณ ที่จ่าย</dt><dd className="text-right">−{n(p.withholding_satang)}</dd>
                {Number(p.penalties_satang) > 0 && <><dt className="text-muted">ค่าปรับ</dt><dd className="text-right">−{n(p.penalties_satang)}</dd></>}
                <dt className="text-muted">เบิกคืน</dt><dd className="text-right">+{n(p.reimburse_satang)}</dd>
                <dt className="font-bold">รับสุทธิ</dt><dd className="text-right font-bold">{n(p.net_satang)}</dd>
              </dl>
              {p.paid_at && <p className="mt-2 text-xs text-muted">โอนเมื่อ {formatBangkok(p.paid_at)}</p>}
            </Panel>
          );
        })
      )}
    </DriverShell>
  );
}
