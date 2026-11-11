import { randomUUID } from "node:crypto";
import { devLoginEnabled } from "@/lib/dev";
import { AppHeader } from "@/components/ui";
import { JoinWithInvite } from "./join";

// FR-DRV-01: เปิดลิงก์เชิญ → login LINE → ผูกบัญชีคนขับ (ลิงก์ใช้ได้ครั้งเดียว)
export default async function JoinPage({ searchParams }: PageProps<"/liff/driver/join">) {
  const token = String((await searchParams).t ?? "");
  return (
    <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
      <AppHeader title="เข้าร่วมทีมคนขับ" subtitle="ผูกบัญชี LINE กับคำเชิญ" />
      <main className="px-5 py-6">
        <JoinWithInvite token={token} liffId={process.env.NEXT_PUBLIC_LIFF_ID_DRIVER} dev={devLoginEnabled()}
          devLineId={`Udev-${randomUUID().slice(0, 8)}`} />
      </main>
    </div>
  );
}
