import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { bangkokToday } from "@/services/compliance";
import { vehicleEligibility } from "@/services/eligibility";
import { carLabel, SERVICE_TYPES } from "@/services/portal";
import { Reasons } from "@/components/Reasons";
import { Empty, Panel, btnSecondary, input } from "@/components/ui";

// FR-VEH-04: รถ/คนที่ไม่ eligible พร้อมเหตุผล ณ วันที่เลือก (BR-COMP-04 ดูล่วงหน้าได้)
export default async function VehiclesPage({ searchParams }: PageProps<"/admin/vehicles">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const sp = await searchParams;
  const date = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : bangkokToday();
  const service = typeof sp.service === "string" ? sp.service : "airport_transfer";
  const rows = await asUser(user.authUserId, (db) => vehicleEligibility(db, date));
  const ok = rows.filter((v) => (v.services.find((s) => s.service === service)?.reasons.length ?? 1) === 0 && v.driver_reasons.length === 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">รถ</h1>
      <form className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className="block text-xs text-muted">วันที่ทำงาน</span>
          <input type="date" name="date" defaultValue={date} className={`${input} py-2`} />
        </label>
        <label className="space-y-1">
          <span className="block text-xs text-muted">บริการ</span>
          <select name="service" defaultValue={service} className={`${input} py-2`}>
            {SERVICE_TYPES.filter((s) => s.value !== "driver_only").map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </label>
        <button className={btnSecondary}>ดู</button>
        <span className="text-sm text-muted">รับงานได้ {ok.length} / {rows.length} คัน</span>
      </form>
      <Panel>
        {rows.length === 0 ? (
          <Empty>ยังไม่มีรถในระบบ</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-muted">
                <tr>
                  <th className="py-2 pr-3 font-medium">ทะเบียน</th>
                  <th className="py-2 pr-3 font-medium">ประเภท</th>
                  <th className="py-2 pr-3 font-medium">คนขับ</th>
                  <th className="py-2 font-medium">เหตุผล (รถ + คนขับ)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((v) => (
                  <tr key={v.id} className="align-top">
                    <td className="py-3 pr-3 font-medium">{v.plate}</td>
                    <td className="py-3 pr-3">{carLabel(v.car_type)}</td>
                    <td className="py-3 pr-3">
                      <Link className="text-sage hover:underline" href={`/admin/drivers/${v.driver_id}`}>{v.driver_name}</Link>
                    </td>
                    <td className="py-3">
                      <Reasons reasons={[...new Set([...(v.services.find((s) => s.service === service)?.reasons ?? []), ...v.driver_reasons])]} />
                    </td>
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
