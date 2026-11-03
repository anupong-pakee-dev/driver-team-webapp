import { ShieldCheck } from "@/components/icons";

// §14 degraded mode: ฐานข้อมูลล่ม → รับจองทางแชท LINE ชั่วคราว (แบบ Pilot) แล้วกรอกย้อนหลัง
// หน้านี้ต้องไม่แตะฐานข้อมูล — ลิงก์ LINE OA มาจาก env
export default function Maintenance() {
  const oa = process.env.NEXT_PUBLIC_LINE_OA_URL;
  return (
    <div className="grid flex-1 place-items-center bg-navy px-6 py-12 text-center text-white">
      <div className="max-w-sm space-y-4">
        <ShieldCheck className="mx-auto h-12 w-12 text-amber" />
        <h1 className="text-2xl font-bold">ระบบปิดปรับปรุงชั่วคราว</h1>
        <p className="text-white/85">ยังจองได้ตามปกติทางแชท LINE — ทีมงานจะส่งใบเสนอราคาให้ในแชท</p>
        {oa && (
          <a href={oa} className="inline-flex rounded-[var(--radius-btn)] bg-amber px-6 py-3.5 font-bold text-navy">
            ทักแชท LINE
          </a>
        )}
        <p className="text-sm text-white/60">Under maintenance — please contact us on LINE.</p>
      </div>
    </div>
  );
}
