import { notFound } from "next/navigation";
import { asUser } from "@/lib/db";
import { carLabel, docSlots, formOptions } from "@/services/portal";
import { DocSlotList } from "@/components/DocSlotList";
import { Panel } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "../../shell";
import { driverPage } from "../../session";
import { VehicleForm } from "../form";

export const dynamic = "force-dynamic";

export default async function VehiclePage({ params }: PageProps<"/liff/driver/vehicles/[id]">) {
  const { user, notDriver } = await driverPage();
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;
  const { id } = await params;

  const [data, options] = await Promise.all([
    asUser(user.authUserId, async (db) => {
      // RLS: เห็นเฉพาะรถของตัวเอง — ของคนอื่นได้ 0 แถว
      const { rows } = await db.query(`select id, plate, car_type, seats, luggage, kyc_status from vehicles where id = $1`, [id]);
      return rows[0] ? { v: rows[0], slots: await docSlots(db, "vehicle", id) } : null;
    }),
    formOptions(),
  ]);
  if (!data) notFound();
  const { v, slots } = data;

  return (
    <DriverShell title={v.plate} subtitle={carLabel(v.car_type)} active="documents" columns={2} back="/liff/driver/documents">
      <Panel title="ข้อมูลรถ">
        {v.kyc_status === "approved" ? (
          <p className="text-sm text-muted">
            {v.seats} ที่นั่ง · {v.luggage} กระเป๋า — อนุมัติแล้ว แก้ข้อมูลพื้นฐานได้โดยติดต่อเจ้าของ
          </p>
        ) : (
          <VehicleForm id={v.id} initial={{ car_type: v.car_type, plate: v.plate, seats: v.seats, luggage: v.luggage }} />
        )}
      </Panel>
      <Panel title="เอกสารรถ">
        <DocSlotList ownerType="vehicle" ownerId={v.id} slots={slots} options={options} />
      </Panel>
    </DriverShell>
  );
}
