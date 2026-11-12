import { redirect } from "next/navigation";
import { asUser } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { termsStatus } from "@/services/drivers";
import { AppHeader, Panel } from "@/components/ui";
import { DriverLoginScreen } from "../shell";
import { driverPage } from "../session";
import { AcceptTerms } from "./accept";

export const dynamic = "force-dynamic";

// FR-DRV-04 · ฉบับใช้งาน 2026-11 (เจ้าของอนุมัติโดยไม่ผ่านทนาย) · ค่าคอมมิชชั่น/ภาษีดึงจาก settings ให้ตรงกับที่ระบบคำนวณจริง
export default async function DriverTerms() {
  const { user, notDriver } = await driverPage({ skipTerms: true });
  if (!user) return <DriverLoginScreen notDriver={notDriver} />;
  const { terms, accepted } = await asUser(user.authUserId, (db) => termsStatus(db, user.id));
  if (accepted) redirect("/liff/driver");
  const [commission, wht] = await Promise.all([
    getSetting<number>("commission_rate"),
    getSetting<{ rate?: number | null }>("withholding"),
  ]);
  const pct = Math.round((commission ?? 0.2) * 100);
  const whtPct = Math.round((wht?.rate ?? 0) * 100);

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-3xl lg:py-6">
      <AppHeader title="ข้อตกลงคนขับ" subtitle="อ่านและยอมรับก่อนเริ่มใช้งาน" />
      <main className="space-y-4 px-5 py-4 pb-10">
        <Panel title={`สัญญาผู้รับจ้างอิสระ (ฉบับ ${terms?.contract_version})`}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-ink">
            <li>คุณเป็นผู้รับจ้างอิสระ ไม่ใช่ลูกจ้าง รับหรือปฏิเสธข้อเสนองานได้เอง และเลือกวันเวลาทำงานเอง</li>
            <li>คุณต้องมีใบอนุญาตขับรถสาธารณะ (หรือใบขับขี่ขนส่ง ท. สำหรับรถตู้) และใช้รถที่จดทะเบียนประเภทรับจ้างหรือให้เช่าตามกฎหมาย ระบบจะไม่ส่งงานให้ถ้าเอกสารใดหมดอายุในวันทำงาน</li>
            <li>รถต้องมี พ.ร.บ. และประกันภาคสมัครใจประเภทรับจ้าง/ให้เช่าที่ยังไม่หมดอายุ (ส่งในแอป) รวมถึงเสียภาษีประจำปีและตรวจสภาพตามกฎหมาย ความเสียหายจากอุบัติเหตุเป็นไปตามกรมธรรม์ของรถคันนั้น</li>
            <li>ค่าตอบแทนต่องาน = ราคางานหักค่าคอมมิชชั่น {pct}%{whtPct > 0 ? ` และภาษี ณ ที่จ่าย ${whtPct}%` : " — บริษัทไม่หักภาษี ณ ที่จ่าย คุณยื่นภาษีเงินได้ของตนเอง"} จ่ายตามรอบที่แสดงในหน้ารายได้ ค่าทางด่วน/ที่จอดที่ลูกค้าต้องจ่ายเบิกคืนตามใบเสร็จ</li>
            <li>รับงานแล้วต้องไปตามนัด เช็กอินพร้อมรูปที่จุดรับและจุดส่งในแอป ยกเลิกงานที่รับแล้วซ้ำ ๆ หรือมีเรื่องร้องเรียน อาจถูกระงับการรับงาน</li>
            <li>สุภาพต่อลูกค้า ปฏิบัติตามกฎจราจร ห้ามดื่มสุราหรือใช้สารเสพติด ห้ามสูบบุหรี่ในรถ และแจ้งเจ้าของทันทีเมื่อเกิดอุบัติเหตุหรือเหตุฉุกเฉิน</li>
            <li>ห้ามติดต่อลูกค้าเพื่อรับงานนอกระบบ ใช้ชื่อและเบอร์ลูกค้าเฉพาะงานนั้น และห้ามเปิดเผยข้อมูลลูกค้าให้ผู้อื่น</li>
            <li>ทั้งสองฝ่ายเลิกสัญญาได้ทุกเมื่อ งานที่รับไว้แล้วต้องทำให้จบหรือแจ้งล่วงหน้าเพื่อให้บริษัทหาคนแทน เมื่อเลิกแล้วขอให้ลบข้อมูลได้ (เก็บเฉพาะประวัติงานและการจ่ายเงินตามกฎหมาย)</li>
            <li>สัญญานี้อยู่ภายใต้กฎหมายไทย</li>
          </ul>
        </Panel>
        <Panel title={`ประกาศความเป็นส่วนตัวสำหรับคนขับ (ฉบับ ${terms?.privacy_version})`}>
          <ul className="list-disc space-y-1.5 pl-5 text-sm">
            <li>เราเก็บเอกสารยืนยันตัวตน ใบขับขี่ บัญชีธนาคาร และเอกสารรถ เพื่อตรวจคุณสมบัติและจ่ายเงิน</li>
            <li>ไฟล์เก็บแบบส่วนตัว เจ้าของบริษัทเท่านั้นที่เปิดดูได้</li>
            <li>ผลตรวจประวัติเก็บแค่ “ผ่าน/ไม่ผ่าน” และวันที่</li>
            <li>ใช้ตำแหน่ง GPS เฉพาะตอนเช็กอินระหว่างงาน</li>
            <li>เอกสารคุณสมบัติลบเมื่อออกจากระบบ ประวัติงานและการจ่ายเงินเก็บ 5 ปีตามกฎหมายบัญชี/ภาษี</li>
            <li>ขอดู แก้ไข หรือลบข้อมูลตาม พ.ร.บ.คุ้มครองข้อมูลส่วนบุคคล 2562 ได้ทาง LINE ของเจ้าของ</li>
          </ul>
        </Panel>
        <AcceptTerms />
      </main>
    </div>
  );
}
