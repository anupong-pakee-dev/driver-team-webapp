import { Panel } from "@/components/ui";
import { DriverLoginScreen, DriverShell } from "../../shell";
import { driverPage } from "../../session";
import { VehicleForm } from "../form";

export const dynamic = "force-dynamic";

export default async function NewVehicle() {
  const { user, notDriver } = await driverPage();
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;
  return (
    <DriverShell title="เพิ่มรถ" active="documents" back="/liff/driver/documents">
      <Panel>
        <VehicleForm />
      </Panel>
    </DriverShell>
  );
}
