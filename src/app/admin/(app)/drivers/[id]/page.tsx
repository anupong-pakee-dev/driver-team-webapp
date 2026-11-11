import { notFound } from "next/navigation";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBangkok } from "@/lib/time";
import { bangkokToday } from "@/services/compliance";
import { driverEligibility, vehicleEligibility } from "@/services/eligibility";
import { carLabel, docSlots, formOptions, SERVICE_TYPES } from "@/services/portal";
import { AdminDocList } from "@/components/AdminDocList";
import { Reasons } from "@/components/Reasons";
import { Badge, Empty, Panel } from "@/components/ui";
import { REMOVED_DRIVER_NAME } from "@/services/driverRemoval";
import { BackgroundCheckForm, RemoveDriver, ReissueInvite, VehicleActiveToggle } from "../../actions";

export default async function DriverDetail({ params }: PageProps<"/admin/drivers/[id]">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const isOwner = user.role === "owner";
  const { id } = await params;
  const today = bangkokToday();

  const data = await asUser(user.authUserId, async (db) => {
    const { rows } = await db.query(
      `select u.id, u.display_name, u.status, coalesce(line_linked(u.id), false) as linked, u.created_at,
              d.kyc_status, d.public_license_class, d.public_license_expiry::text, d.background_check_at::text,
              d.background_check_passed, d.bank_account_last4, d.score
         from users u join drivers d on d.user_id = u.id where u.id = $1`,
      [id],
    );
    if (!rows[0]) return null;
    const vehicles = await vehicleEligibility(db, today, { driverId: id });
    return {
      d: rows[0],
      slots: isOwner ? await docSlots(db, "driver", id) : [],
      vehicles,
      vehicleSlots: isOwner ? await Promise.all(vehicles.map((v) => docSlots(db, "vehicle", v.id))) : [],
      driverReasons: (await driverEligibility(db, today, { driverId: id })).get(id) ?? [],
      consents: (await db.query(
        `select distinct on (kind) kind, version, granted, at from consents where user_id = $1 order by kind, at desc`, [id],
      )).rows,
    };
  });
  if (!data) notFound();
  const { d } = data;
  const opts = await formOptions();
  const labels = Object.fromEntries([...opts.registration_types, ...opts.license_classes].map((o) => [o.code, o.label_th]));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">{d.display_name}</h1>
        {d.linked ? <Badge tone="ok">ผูก LINE แล้ว</Badge> : <Badge tone="warn">ยังไม่รับคำเชิญ</Badge>}
        {d.status !== "active" && <Badge tone="bad">{d.status}</Badge>}
      </div>
      {!d.linked && isOwner && <ReissueInvite driverId={d.id} />}

      <Panel title={`คุณสมบัติคนขับ ณ วันนี้ (${today})`}>
        <Reasons reasons={data.driverReasons} />
        <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm md:grid-cols-[auto_1fr_auto_1fr]">
          <dt className="text-muted">ประเภทใบขับขี่</dt><dd>{d.public_license_class ? labels[d.public_license_class] ?? d.public_license_class : "—"}</dd>
          <dt className="text-muted">ใบขับขี่หมดอายุ</dt><dd>{d.public_license_expiry ?? "—"}</dd>
          <dt className="text-muted">บัญชีธนาคาร</dt><dd>{d.bank_account_last4 ? `xxx-${d.bank_account_last4}` : "—"}</dd>
          <dt className="text-muted">คะแนน</dt><dd>{d.score}</dd>
          {isOwner && (
            <>
              <dt className="text-muted">ตรวจประวัติ</dt>
              <dd>
                {d.background_check_at
                  ? <>{d.background_check_passed ? <Badge tone="ok">ผ่าน</Badge> : <Badge tone="bad">ไม่ผ่าน</Badge>} {d.background_check_at}</>
                  : "ยังไม่บันทึก"}
              </dd>
            </>
          )}
        </dl>
        {isOwner && (
          <div className="mt-4 border-t border-line pt-4">
            <div className="mb-2 text-sm font-medium">บันทึกผลตรวจประวัติ (เก็บแค่วันที่และผล)</div>
            <BackgroundCheckForm driverId={d.id} />
          </div>
        )}
      </Panel>

      <Panel title="สัญญาและความยินยอม">
        {data.consents.length === 0 ? (
          <Empty>ยังไม่ได้ยอมรับ</Empty>
        ) : (
          <ul className="space-y-1 text-sm">
            {data.consents.map((c) => (
              <li key={c.kind} className="flex gap-2">
                <Badge tone={c.granted ? "ok" : "bad"}>{c.kind === "driver_contract" ? "สัญญา" : c.kind === "privacy" ? "ความเป็นส่วนตัว" : c.kind}</Badge>
                <span>ฉบับ {c.version} · {formatBangkok(c.at)}</span>
              </li>
            ))}
          </ul>
        )}
        {!isOwner && <p className="mt-2 text-xs text-muted">รายละเอียดดูได้เฉพาะเจ้าของ</p>}
      </Panel>

      {isOwner ? (
        <Panel title="เอกสารคนขับ">
          <AdminDocList slots={data.slots} canReview labels={labels} />
        </Panel>
      ) : (
        <Panel><p className="text-sm text-muted">เอกสาร KYC เปิดดูได้เฉพาะเจ้าของ</p></Panel>
      )}

      {data.vehicles.map((v, i) => (
        <Panel key={v.id} title={`รถ ${v.plate} · ${carLabel(v.car_type)}`}>
          <div className="mb-3 space-y-2">
            {SERVICE_TYPES.filter((s) => s.value !== "driver_only").map((s) => {
              const r = v.services.find((x) => x.service === s.value)?.reasons ?? [];
              return (
                <div key={s.value} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-36 text-muted">{s.label}</span>
                  <Reasons reasons={[...new Set([...r, ...v.driver_reasons])]} />
                </div>
              );
            })}
          </div>
          {isOwner && <VehicleActiveToggle id={v.id} active={v.active} />}
          {isOwner && <div className="mt-3 border-t border-line pt-3"><AdminDocList slots={data.vehicleSlots[i]} canReview labels={labels} /></div>}
        </Panel>
      ))}
      {isOwner && d.display_name !== REMOVED_DRIVER_NAME && (
        <Panel title="ลบคนขับ">
          <div className="space-y-3 text-sm">
            <p className="text-muted">
              ถ้ายังไม่เคยมีงานหรือข้อเสนองาน ระบบจะลบบัญชีทั้งหมด · ถ้าเคยมีงานแล้ว ระบบจะบล็อกบัญชีและลบข้อมูลส่วนตัว
              (ชื่อจริง เบอร์โทร LINE เลขใบขับขี่ บัญชีธนาคาร ไฟล์เอกสาร) แต่เก็บประวัติงานและยอดเงินไว้ทำบัญชี
            </p>
            <RemoveDriver driverId={d.id} name={d.display_name ?? ""} />
          </div>
        </Panel>
      )}
    </div>
  );
}
