import type { Metadata } from "next";
import { peekStaffInvite } from "@/services/staff";
import { JoinForm } from "./form";

export const metadata: Metadata = { title: "ตั้งรหัสผ่านแอดมิน", robots: { index: false } };

const ROLE_TH = { sales_admin: "แอดมินขาย", owner: "เจ้าของ" } as const;
const REASON_TH: Record<string, string> = {
  INVITE_INVALID: "ลิงก์เชิญไม่ถูกต้อง",
  INVITE_USED: "ลิงก์นี้ถูกใช้ไปแล้ว — เข้าสู่ระบบด้วยอีเมลและรหัสผ่านที่ตั้งไว้",
  INVITE_EXPIRED: "ลิงก์หมดอายุ — ขอลิงก์ใหม่จากเจ้าของ",
};

// ผู้ได้รับเชิญเป็นแอดมิน: ตั้งรหัสผ่านเอง (ลิงก์ใช้ครั้งเดียว)
export default async function StaffJoinPage({ searchParams }: PageProps<"/admin/join">) {
  const token = String((await searchParams).t ?? "");
  const inv = token.length >= 20 ? await peekStaffInvite(token) : { ok: false as const, reason: "INVITE_INVALID" };

  return (
    <div className="grid flex-1 place-items-center bg-navy px-5 py-10">
      <div className="w-full max-w-sm space-y-4 rounded-[var(--radius-card)] bg-card p-6 shadow-lg">
        <div>
          <h1 className="text-2xl font-bold">เข้าร่วมหลังบ้าน</h1>
          <p className="text-sm text-muted">Avera Taxi Thailand</p>
        </div>
        {inv.ok ? (
          <>
            <dl className="space-y-1 rounded-xl bg-page p-3 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted">ชื่อ</dt><dd className="font-medium">{inv.displayName}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">อีเมล</dt><dd className="break-all font-medium">{inv.email}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted">สิทธิ์</dt><dd className="font-medium">{ROLE_TH[inv.role]}</dd></div>
            </dl>
            <JoinForm token={token} email={inv.email} />
          </>
        ) : (
          <p className="text-sm text-bad">{REASON_TH[inv.reason] ?? REASON_TH.INVITE_INVALID}</p>
        )}
      </div>
    </div>
  );
}
