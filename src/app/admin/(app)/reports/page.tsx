import { requireStaffPage } from "@/lib/auth";
import { bangkokToday } from "@/services/compliance";
import { Panel, btnSecondary, input } from "@/components/ui";

// FR-REP-02 export CSV สำหรับนักบัญชี (เลือกช่วงวันที่)
export default async function ReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  await requireStaffPage(["sales_admin", "owner"]);
  const sp = await searchParams;
  const today = bangkokToday();
  const from = typeof sp.from === "string" ? sp.from : `${today.slice(0, 8)}01`;
  const to = typeof sp.to === "string" ? sp.to : today;
  const files = [["bookings.csv", "งาน (ราคา มัดจำ ชำระแล้ว คืนเงิน ส่วนคนขับ ที่มา)"], ["payments.csv", "การรับ/คืนเงิน + เลขที่ใบเสร็จ"], ["payouts.csv", "จ่ายเงินคนขับ (ค่าคอม หัก ณ ที่จ่าย สุทธิ)"]];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">รายงาน / Export</h1>
      <Panel title="ช่วงวันที่ (เวลาไทย)">
        <form className="flex flex-wrap items-end gap-3">
          <label className="space-y-1"><span className="block text-xs text-muted">ตั้งแต่</span><input type="date" name="from" defaultValue={from} className={`${input} py-2`} /></label>
          <label className="space-y-1"><span className="block text-xs text-muted">ถึง</span><input type="date" name="to" defaultValue={to} className={`${input} py-2`} /></label>
          <button className={btnSecondary}>ใช้ช่วงนี้</button>
        </form>
      </Panel>
      <Panel title="ดาวน์โหลด CSV (เปิดใน Excel ได้ภาษาไทย)">
        <ul className="space-y-2">
          {files.map(([f, label]) => (
            <li key={f} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm"><b>{f}</b> — {label}</span>
              <a className={btnSecondary} href={`/api/admin/exports/${f}?from=${from}&to=${to}`}>ดาวน์โหลด</a>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted">ไม่มีชื่อ/เบอร์ลูกค้าในไฟล์ · เงินเป็นบาท ทศนิยม 2 ตำแหน่ง</p>
      </Panel>
    </div>
  );
}
