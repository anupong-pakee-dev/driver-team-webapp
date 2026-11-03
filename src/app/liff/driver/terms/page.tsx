import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { termsStatus } from "@/services/drivers";
import { AppHeader, Panel } from "@/components/ui";
import { DriverLoginScreen } from "../shell";
import { driverPage } from "../session";
import { AcceptTerms } from "./accept";

export const dynamic = "force-dynamic";

// FR-DRV-04 · ❓ เนื้อหาสัญญาและ Privacy Notice รอทนาย — ข้อความนี้เป็นร่างสรุปเพื่อทดสอบระบบ
export default async function DriverTerms() {
  const { user, notDriver } = await driverPage({ skipTerms: true });
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;
  const { terms, accepted } = await asUser(user.authUserId, (db) => termsStatus(db, user.id));
  if (accepted) redirect("/liff/driver");

  return (
    <div className="mx-auto w-full max-w-md">
      <AppHeader title="ข้อตกลงคนขับ" subtitle="อ่านและยอมรับก่อนเริ่มใช้งาน" />
      <main className="space-y-4 px-5 py-4 pb-10">
        <Panel title={`สัญญาผู้รับจ้างอิสระ (ฉบับ ${terms?.contract_version})`}>
          <div className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">ร่าง — รอทนายตรวจ เนื้อหาจริงจะแทนที่ก่อนเปิดใช้</div>
          <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>คุณเป็นผู้รับจ้างอิสระ รับหรือปฏิเสธงานได้เอง</li>
            <li>รถและเอกสาร (ใบขับขี่สาธารณะ, พ.ร.บ., ประกันประเภทรับจ้าง, ประกันผู้โดยสาร, ภาษี) ต้องไม่หมดอายุในวันทำงาน</li>
            <li>ห้ามติดต่อลูกค้าเพื่อรับงานนอกระบบ</li>
            <li>ค่าตอบแทน = ค่างานหักค่าคอมมิชชั่นและภาษี ณ ที่จ่ายตามกฎหมาย</li>
          </ul>
        </Panel>
        <Panel title={`ประกาศความเป็นส่วนตัวสำหรับคนขับ (ฉบับ ${terms?.privacy_version})`}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>เราเก็บเอกสารยืนยันตัวตน ใบขับขี่ บัญชีธนาคาร และเอกสารรถ เพื่อตรวจคุณสมบัติและจ่ายเงิน</li>
            <li>ไฟล์เก็บแบบส่วนตัว เจ้าของบริษัทเท่านั้นที่เปิดดูได้</li>
            <li>ผลตรวจประวัติเก็บแค่ “ผ่าน/ไม่ผ่าน” และวันที่</li>
            <li>ใช้ตำแหน่ง GPS เฉพาะตอนเช็กอินระหว่างงาน</li>
          </ul>
        </Panel>
        <AcceptTerms />
      </main>
    </div>
  );
}
