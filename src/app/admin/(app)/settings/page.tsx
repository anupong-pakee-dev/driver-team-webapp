import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBangkok } from "@/lib/time";
import { Panel } from "@/components/ui";
import { SettingEditor } from "./editor";

// FR-ADMIN-02 · ADR-10
const LABELS: Record<string, string> = {
  deposit_pct: "สัดส่วนมัดจำ",
  deposit_window_minutes: "เวลาให้จ่ายมัดจำ (นาที)",
  admin_max_discount: "ส่วนลดสูงสุดที่แอดมินให้เองได้",
  commission_rate: "ค่าคอมมิชชั่น",
  offer_ttl_minutes: "เวลาให้คนขับตอบรับงาน (นาที)",
  offer_ttl_urgent_minutes: "เวลาตอบรับงานด่วน (นาที)",
  buffer_minutes: "เวลากันชนระหว่างงาน (นาที)",
  contact_window_hours: "ช่วงที่คนขับขอเบอร์ลูกค้าได้ (ชม.)",
  auto_complete_hours: "ปิดงานอัตโนมัติหลังส่งถึง (ชม.)",
  far_from_target_m: "ระยะเตือนห่างจุดนัด (ม.)",
  cancellation_policy: "นโยบายยกเลิก ❓ ทนาย",
  compliance: "เกณฑ์เอกสาร",
  payment_adapter: "ช่องทางรับมัดจำ (gateway / slip)",
  vat_registered: "จด VAT แล้ว",
  penalties_enabled: "เปิดระบบหักคะแนน/ค่าปรับ",
  partners_enabled: "เปิดระบบพาร์ทเนอร์",
  capi_enabled: "ส่ง conversion ให้แพลตฟอร์มโฆษณา",
  session_hours: "อายุ session (ชม.)",
  brand: "ชื่อแบรนด์",
  catalog: "ข้อความแคตตาล็อก",
};

export default async function SettingsPage() {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const rows = await asUser(user.authUserId, async (db) =>
    (await db.query(`select key, value, updated_at from settings order by key`)).rows);
  const canEdit = user.role === "owner";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">ตั้งค่า</h1>
        <p className="text-sm text-muted">
          {canEdit ? "แก้ได้เฉพาะเจ้าของ · ทุกการแก้ต้องใส่เหตุผลและถูกบันทึก" : "ดูได้อย่างเดียว — แก้ได้เฉพาะเจ้าของ"}
        </p>
      </div>
      <Panel>
        <ul className="divide-y divide-line">
          {rows.map((r) => (
            <li key={r.key} className="grid gap-2 py-3 md:grid-cols-[16rem_1fr]">
              <div>
                <div className="font-medium">{LABELS[r.key] ?? r.key}</div>
                <div className="font-mono text-xs text-muted">{r.key}</div>
                <div className="text-xs text-muted">แก้ล่าสุด {formatBangkok(r.updated_at)}</div>
              </div>
              <SettingEditor settingKey={r.key} initial={JSON.stringify(r.value, null, 2)} canEdit={canEdit} />
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
