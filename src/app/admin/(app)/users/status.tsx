"use client";

import { useRouter } from "next/navigation";

export function UserStatus({ userId, status }: { userId: string; status: string }) {
  const router = useRouter();
  const set = async (next: string) => {
    const reason = window.prompt(next === "active" ? "เหตุผลที่ปลดบล็อก" : "เหตุผลที่ระงับ/บล็อก");
    if (!reason || reason.trim().length < 3) return;
    await fetch(`/api/admin/users/${userId}/status`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status: next, reason }),
    });
    router.refresh();
  };
  return status === "active" ? (
    <div className="flex gap-2">
      <button className="rounded-lg border border-line px-2.5 py-1.5 text-xs" onClick={() => set("suspended")}>ระงับ</button>
      <button className="rounded-lg border border-bad px-2.5 py-1.5 text-xs text-bad" onClick={() => set("blocked")}>บล็อก</button>
    </div>
  ) : (
    <button className="rounded-lg border border-line px-2.5 py-1.5 text-xs" onClick={() => set("active")}>ปลดบล็อก</button>
  );
}
