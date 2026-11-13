import type { Metadata } from "next";
import { randomUUID } from "node:crypto";
import { devLoginEnabled } from "@/lib/dev";
import { AppHeader } from "@/components/ui";
import { ApplyFlow } from "./apply";

export const metadata: Metadata = { title: "สมัครเป็นคนขับ", robots: { index: false } };

// ปลายทางของ QR สาธารณะ: ล็อกอิน LINE → กรอกข้อมูล → รอเจ้าของอนุมัติ
export default function DriverApplyPage() {
  return (
    <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
      <AppHeader title="สมัครเป็นคนขับ" subtitle="Avera Taxi Thailand · ร่วมเป็นพาร์ทเนอร์กับเรา" />
      <main className="px-5 py-6">
        <ApplyFlow liffId={process.env.NEXT_PUBLIC_LIFF_ID_DRIVER} dev={devLoginEnabled()} devLineId={`Udev-apply-${randomUUID().slice(0, 8)}`} />
      </main>
    </div>
  );
}
