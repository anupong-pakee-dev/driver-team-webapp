import { getSetting } from "@/lib/settings";
import { AppHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

// FR-PDPA-01 ประกาศความเป็นส่วนตัว (ลูกค้า/คนขับ แยก) มี version · ❓ เนื้อหาร่าง รอทนาย (T8)
export default async function Privacy() {
  const v = await getSetting<{ customer_version: string; driver_version: string }>("privacy_notice");
  return (
    <div className="mx-auto w-full max-w-md">
      <AppHeader title="ความเป็นส่วนตัว" subtitle="ประกาศความเป็นส่วนตัว" />
      <main className="space-y-4 px-5 py-4 pb-10 text-sm">
        <div className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">ร่าง — รอทนายตรวจ เนื้อหาจริงจะแทนที่ก่อนเปิดใช้</div>
        <Panel title={`สำหรับลูกค้า (ฉบับ ${v?.customer_version})`}>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>ข้อมูลที่เก็บ: ชื่อ เบอร์โทร LINE user ID รายละเอียดการเดินทาง การชำระเงิน — เพื่อให้บริการ ออกใบเสร็จ และติดต่อในวันเดินทาง</li>
            <li>คนขับเห็นชื่อ/เบอร์เฉพาะงานของตัวเองใกล้เวลารับ ทุกครั้งที่เปิดดูถูกบันทึก</li>
            <li>คุกกี้วัดผลโฆษณาใช้เมื่อคุณยินยอมเท่านั้น ข้อมูลที่ส่งให้แพลตฟอร์มโฆษณาถูกแปลง (hash) ก่อนส่ง</li>
            <li>ข้อมูลประมวลผลบนคลาวด์ในภูมิภาคใกล้ไทย (เช่น สิงคโปร์) ❓</li>
            <li>ขอดู แก้ไข หรือลบข้อมูล หรือถอนความยินยอม: ทักแชท LINE ของเรา</li>
          </ul>
        </Panel>
        <Panel title={`สำหรับคนขับ (ฉบับ ${v?.driver_version})`}>
          <ul className="list-disc space-y-1.5 pl-5">
            <li>เอกสารยืนยันตัวตน ใบขับขี่ บัญชีธนาคาร และเอกสารรถ เพื่อตรวจคุณสมบัติและจ่ายเงิน — ไฟล์เก็บแบบส่วนตัว</li>
            <li>ผลตรวจประวัติเก็บเฉพาะ “ผ่าน/ไม่ผ่าน” และวันที่</li>
            <li>ตำแหน่ง GPS และรูปเก็บเฉพาะตอนเช็กอินระหว่างงาน</li>
          </ul>
        </Panel>
      </main>
    </div>
  );
}
