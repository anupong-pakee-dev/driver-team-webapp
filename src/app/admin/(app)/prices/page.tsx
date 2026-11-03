import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBaht } from "@/lib/money";
import { formatBangkok } from "@/lib/time";
import { CAR_TYPES, carLabel, SERVICE_TYPES } from "@/services/portal";
import { Empty, Panel } from "@/components/ui";
import { PriceRuleEditor } from "./editor";

// FR-PRICE-02 · §2.2 price_rules: sales_admin อ่าน · owner แก้ (เวอร์ชันใหม่ มีผลกับใบเสนอราคาใหม่เท่านั้น)
export default async function PricesPage() {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const { active, history } = await asUser(user.authUserId, async (db) => ({
    active: (await db.query(
      `select id, car_type, service_type, base_satang::int, included_km, per_km_satang::int, included_minutes,
              ot_per_hour_satang::int, wait_per_hour_satang::int, free_wait_minutes, floor_satang::int, tax_category, active_from
         from price_rules where active_from <= now() and (active_to is null or active_to > now())
        order by service_type, base_satang`,
    )).rows,
    history: (await db.query(
      `select car_type, service_type, base_satang::int, active_from, active_to from price_rules
        where active_to is not null and active_to <= now() order by active_to desc limit 20`,
    )).rows,
  }));
  const isOwner = user.role === "owner";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ราคา</h1>
        <p className="text-sm text-muted">ราคา &ldquo;เริ่ม&rdquo; ในแคตตาล็อก = ค่าบริการพื้นฐาน · แก้แล้วมีผลกับใบเสนอราคาใหม่เท่านั้น</p>
      </div>
      {SERVICE_TYPES.map((svc) => {
        const rules = active.filter((r) => r.service_type === svc.value);
        return (
          <Panel key={svc.value} title={svc.label}>
            {rules.length === 0 && <Empty>ยังไม่เปิดขาย</Empty>}
            <ul className="divide-y divide-line">
              {rules.map((r) => (
                <li key={r.id} className="py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{carLabel(r.car_type)}</span>
                    <span className="text-sm">
                      เริ่ม <b>{formatBaht(r.base_satang)}</b> · ขั้นต่ำ {formatBaht(r.floor_satang)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    รวม {r.included_km} กม. / {Math.round(r.included_minutes / 6) / 10} ชม. · เกินกม.ละ {formatBaht(r.per_km_satang)} ·
                    ชม.เกิน {formatBaht(r.ot_per_hour_satang)} · ค่ารอ {formatBaht(r.wait_per_hour_satang)}/ชม. (ฟรี {r.free_wait_minutes} นาที) ·
                    ภาษี {r.tax_category} · ใช้ตั้งแต่ {formatBangkok(r.active_from)}
                  </div>
                  {isOwner && <PriceRuleEditor rule={r} />}
                </li>
              ))}
            </ul>
            {isOwner && (
              <div className="mt-3 border-t border-line pt-3">
                <PriceRuleEditor
                  newFor={svc.value}
                  carOptions={[...CAR_TYPES, { value: "driver_only", label: "คนขับอย่างเดียว" }]
                    .filter((c) => !rules.some((r) => r.car_type === c.value))}
                />
              </div>
            )}
          </Panel>
        );
      })}
      {history.length > 0 && (
        <Panel title="ราคาเดิมที่เลิกใช้ (20 รายการล่าสุด)">
          <ul className="space-y-1 text-sm text-muted">
            {history.map((h, i) => (
              <li key={i}>
                {SERVICE_TYPES.find((s) => s.value === h.service_type)?.label} · {carLabel(h.car_type)} · {formatBaht(h.base_satang)} ·
                {" "}{formatBangkok(h.active_from)} – {formatBangkok(h.active_to)}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}
