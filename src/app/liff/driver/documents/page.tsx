import Link from "next/link";
import { asUser } from "@/lib/db";
import { carLabel, docSlots, formOptions } from "@/services/portal";
import { DocSlotList } from "@/components/DocSlotList";
import { Badge, Empty, Panel, btnSecondary } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "../shell";
import { driverPage } from "../session";

export const dynamic = "force-dynamic";

export default async function DriverDocuments() {
  const { user, notDriver } = await driverPage();
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;

  const [data, options] = await Promise.all([
    asUser(user.authUserId, async (db) => ({
      slots: await docSlots(db, "driver", user.id),
      vehicles: (await db.query(`select id, plate, car_type, kyc_status from vehicles order by created_at`)).rows,
    })),
    formOptions(),
  ]);

  return (
    <DriverShell title="เอกสารและรถ" subtitle="ส่งให้เจ้าของตรวจก่อนรับงาน" active="documents">
      <Panel title="เอกสารคนขับ">
        <DocSlotList ownerType="driver" ownerId={user.id} slots={data.slots} options={options} />
      </Panel>

      <Panel title="รถของฉัน">
        {data.vehicles.length === 0 ? (
          <Empty>ยังไม่มีรถ</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {data.vehicles.map((v) => (
              <li key={v.id}>
                <Link href={`/liff/driver/vehicles/${v.id}`} className="flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium">{v.plate}</div>
                    <div className="text-sm text-muted">{carLabel(v.car_type)}</div>
                  </div>
                  <Badge tone={v.kyc_status === "approved" ? "ok" : v.kyc_status === "rejected" ? "bad" : "warn"}>
                    {v.kyc_status === "approved" ? "อนุมัติแล้ว" : v.kyc_status === "rejected" ? "มีเอกสารไม่ผ่าน" : "รอเอกสาร"}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Link href="/liff/driver/vehicles/new" className={`${btnSecondary} mt-3 w-full`}>
          + เพิ่มรถ
        </Link>
      </Panel>
    </DriverShell>
  );
}
