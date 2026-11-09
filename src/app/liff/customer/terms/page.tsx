import type { CancelPolicy } from "@/domain/cancellation";
import { getSetting } from "@/lib/settings";
import { AppHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

// FR-BOOK-03 / BR-CANCEL-02 · ❓ เนื้อหาร่าง รอทนายตรวจ — ตารางยกเลิกดึงจาก settings (ตรงกับที่ระบบคำนวณจริง)
export default async function CustomerTerms() {
  const [terms, p] = await Promise.all([
    getSetting<{ terms_version: string; privacy_version: string }>("customer_terms"),
    getSetting<CancelPolicy>("cancellation_policy"),
  ]);
  const policy = p!;
  return (
    <div className="mx-auto w-full max-w-md">
      <AppHeader title="เงื่อนไขการใช้บริการ" subtitle={`ฉบับ ${terms?.terms_version}`} />
      <main className="space-y-4 px-5 py-4 pb-10 text-sm">
        <div className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">ร่าง — รอทนายตรวจ เนื้อหาจริงจะแทนที่ก่อนเปิดใช้</div>
        <Panel title="ราคาและการชำระ">
          <ul className="list-disc space-y-1.5 pl-5">
            <li>ราคาตามใบเสนอราคา รวมน้ำมันและคนขับ ไม่รวมทางด่วน ค่าจอด และที่พักคนขับ (เบิกตามจริงพร้อมใบเสร็จ)</li>
            <li>ยืนยันการจองเมื่อชำระมัดจำแล้วเท่านั้น ชำระเข้าบัญชีบริษัทเท่านั้น</li>
            <li>ยอดคงเหลือชำระก่อนเริ่มงาน เว้นแต่ระบุไว้เป็นอย่างอื่น</li>
            <li>รอฟรีตามที่ระบุ เกินจากนั้นคิดค่ารอตามอัตราในใบเสนอราคา ปัดขึ้นทีละ 30 นาที</li>
          </ul>
        </Panel>
        <Panel title="นโยบายยกเลิก">
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr><th className="py-1 font-medium">กรณี</th><th className="py-1 font-medium">คืนมัดจำ</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="py-1.5">ยกเลิกก่อนเดินทางมากกว่า {policy.full_refund_hours} ชม.</td><td>100%</td></tr>
              <tr><td className="py-1.5">ยกเลิก {policy.mid_hours ?? 24}–{policy.full_refund_hours} ชม. ก่อนเดินทาง</td><td>{policy.mid.refundPct}%</td></tr>
              <tr><td className="py-1.5">ยกเลิกน้อยกว่า {policy.mid_hours ?? 24} ชม.</td><td>0%</td></tr>
              <tr><td className="py-1.5">ไม่มาตามนัด (no-show)</td><td>0% + ค่ารอ</td></tr>
              <tr><td className="py-1.5">บริษัทจัดรถไม่ได้ / เที่ยวบินยกเลิก (มีหลักฐาน)</td><td>100%</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">ยอดคงเหลือที่ชำระแล้วคืนเต็มทุกกรณี</p>
        </Panel>
        <Panel title={`ประกาศความเป็นส่วนตัว (ฉบับ ${terms?.privacy_version})`}>
          <div id="privacy" />
          <ul className="list-disc space-y-1.5 pl-5">
            <li>เราเก็บชื่อ เบอร์โทร และรายละเอียดการเดินทาง เพื่อให้บริการและออกใบเสร็จ</li>
            <li>คนขับเห็นชื่อและเบอร์ของคุณเฉพาะช่วงใกล้เวลารับ และทุกครั้งที่เปิดดูถูกบันทึกไว้</li>
            <li>ข้อมูลประมวลผลบนคลาวด์ในภูมิภาคใกล้ไทย ❓</li>
            <li>ขอดู แก้ไข หรือลบข้อมูลได้ทางแชท LINE</li>
          </ul>
        </Panel>
      </main>
    </div>
  );
}
