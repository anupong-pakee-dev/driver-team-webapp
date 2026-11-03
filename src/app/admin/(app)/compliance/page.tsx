import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { CAR_TYPES, formOptions, SERVICE_TYPES } from "@/services/portal";
import { Panel } from "@/components/ui";
import { MatrixEditor } from "./matrix";

// BR-COMP-05: กรอกตามคำตอบ ขบ. เท่านั้น · ว่าง = ไม่มีรถ/คนขับคันไหนรับงานได้
export default async function CompliancePage() {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const [opts, data] = await Promise.all([
    formOptions(),
    asUser(user.authUserId, async (db) => ({
      regs: (await db.query(`select service_type, registration_type, confirmed_by_dlt_at::text from allowed_registrations`)).rows,
      cov: (await db.query(`select license_class, car_type from license_coverage`)).rows,
    })),
  ]);
  const canEdit = user.role === "owner";
  const services = SERVICE_TYPES.filter((s) => s.value !== "driver_only");

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">กฎ ขบ.</h1>
        <p className="text-sm text-muted">
          กรอกตามคำตอบกรมการขนส่งทางบก (1584) เท่านั้น · รายการประเภททะเบียน/ใบขับขี่แก้ได้ในหน้าตั้งค่า (registration_types, license_classes)
        </p>
      </div>
      <Panel title="ประเภทจดทะเบียนที่รับงานแต่ละบริการได้">
        <MatrixEditor
          kind="registrations"
          canEdit={canEdit}
          rows={opts.registration_types.map((o) => ({ value: o.code, label: o.label_th }))}
          cols={services}
          checked={data.regs.map((r) => `${r.registration_type}|${r.service_type}`)}
          confirmedAt={data.regs[0]?.confirmed_by_dlt_at ?? null}
        />
      </Panel>
      <Panel title="ประเภทใบขับขี่ที่ขับรถแต่ละประเภทได้">
        <MatrixEditor
          kind="coverage"
          canEdit={canEdit}
          rows={opts.license_classes.map((o) => ({ value: o.code, label: o.label_th }))}
          cols={CAR_TYPES}
          checked={data.cov.map((r) => `${r.license_class}|${r.car_type}`)}
          confirmedAt={null}
        />
      </Panel>
    </div>
  );
}
