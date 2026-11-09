import { asUser } from "@/lib/db";
import { formatBangkok } from "@/lib/time";
import { Empty, Panel } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "../shell";
import { driverPage } from "../session";
import { AddBlock, RemoveBlock } from "./blocks";

export const dynamic = "force-dynamic";

// FR-DISP-04: ช่วงที่ปิดรับงาน + งานที่รับแล้ว (ระบบจะไม่เสนองานที่ชนเวลา)
export default async function DriverCalendar() {
  const { user, notDriver } = await driverPage();
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;

  const data = await asUser(user.authUserId, async (db) => ({
    blocks: (await db.query(
      `select id, lower(period) as from_at, upper(period) as to_at from availability
        where kind = 'blocked' and upper(period) > now() order by lower(period)`,
    )).rows,
    jobs: (await db.query(
      `select id, pickup_at, est_end_at from bookings
        where driver_id = $1 and status in ('assigned','en_route','arrived','picked_up','dropped_off') and est_end_at > now()
        order by pickup_at`,
      [user.id],
    )).rows,
  }));

  return (
    <DriverShell title="ปฏิทิน" subtitle="ปิดช่วงที่ไม่สะดวกรับงาน" active="calendar">
      <Panel title="ปิดรับงานช่วงเวลา">
        <AddBlock />
      </Panel>
      <Panel title="ช่วงที่ปิดไว้">
        {data.blocks.length === 0 ? (
          <Empty>ยังไม่ได้ปิดช่วงไหน — ระบบถือว่าว่างทุกช่วง</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data.blocks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span>{formatBangkok(b.from_at)} – {formatBangkok(b.to_at)}</span>
                <RemoveBlock id={b.id} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title="งานที่รับแล้ว">
        {data.jobs.length === 0 ? (
          <Empty>ยังไม่มีงาน</Empty>
        ) : (
          <ul className="divide-y divide-line text-sm">
            {data.jobs.map((j) => (
              <li key={j.id} className="py-3">{formatBangkok(j.pickup_at)} – {formatBangkok(j.est_end_at)}</li>
            ))}
          </ul>
        )}
      </Panel>
    </DriverShell>
  );
}
