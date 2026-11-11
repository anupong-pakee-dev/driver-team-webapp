import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { bangkokToday } from "@/services/compliance";
import { driverEligibility } from "@/services/eligibility";
import { Reasons } from "@/components/Reasons";
import { Badge, Empty, Panel } from "@/components/ui";
import { InviteForm } from "../actions";

const KYC_TONE = { approved: "ok", pending: "warn", rejected: "bad" } as const;
const KYC_TH = { approved: "อนุมัติ", pending: "รอเอกสาร", rejected: "มีเอกสารไม่ผ่าน" } as const;

export default async function DriversPage() {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const today = bangkokToday();
  const { drivers, elig } = await asUser(user.authUserId, async (db) => ({
    drivers: (await db.query(
      `select u.id, u.display_name, u.status, coalesce(line_linked(u.id), false) as linked, d.kyc_status,
              d.background_check_passed, d.background_check_at, d.score,
              (select count(*) from vehicles v where v.driver_id = u.id)::int as vehicles,
              (select count(*) from documents x where x.status = 'pending' and
                 ((x.owner_type = 'driver' and x.owner_id = u.id) or
                  (x.owner_type = 'vehicle' and x.owner_id in (select id from vehicles where driver_id = u.id))))::int as pending_docs
         from users u join drivers d on d.user_id = u.id
        order by u.display_name`,
    )).rows,
    elig: await driverEligibility(db, today),
  }));

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">คนขับ</h1>
      {user.role === "owner" && (
        <Panel title="เชิญคนขับใหม่">
          <InviteForm />
        </Panel>
      )}
      <Panel title={`คนขับทั้งหมด (${drivers.length})`}>
        {drivers.length === 0 ? (
          <Empty>ยังไม่มีคนขับ</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">ชื่อ</th>
                  <th className="py-2 pr-3 font-medium">LINE</th>
                  <th className="py-2 pr-3 font-medium">เอกสาร</th>
                  <th className="py-2 pr-3 font-medium">รถ</th>
                  <th className="py-2 font-medium">คุณสมบัติคนขับวันนี้</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {drivers.map((d) => (
                  <tr key={d.id} className="align-top">
                    <td className="py-3 pr-3">
                      <Link href={`/admin/drivers/${d.id}`} className="font-medium text-sage underline-offset-2 hover:underline">
                        {d.display_name}
                      </Link>
                      {d.status !== "active" && <Badge tone="bad">{d.status}</Badge>}
                    </td>
                    <td className="py-3 pr-3">{d.linked ? <Badge tone="ok">ผูกแล้ว</Badge> : <Badge tone="warn">รอรับคำเชิญ</Badge>}</td>
                    <td className="py-3 pr-3">
                      <Badge tone={KYC_TONE[d.kyc_status as keyof typeof KYC_TONE]}>{KYC_TH[d.kyc_status as keyof typeof KYC_TH]}</Badge>
                      {d.pending_docs > 0 && <div className="mt-1 text-xs text-navy">รอตรวจ {d.pending_docs}</div>}
                    </td>
                    <td className="py-3 pr-3">{d.vehicles}</td>
                    <td className="py-3"><Reasons reasons={elig.get(d.id) ?? []} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
