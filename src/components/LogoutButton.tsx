"use client";

import { useRouter } from "next/navigation";

export function LogoutButton({ to = "/", className = "" }: { to?: string; className?: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className={className || "rounded-lg border border-white/30 px-3 py-1.5 text-sm"}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push(to);
        router.refresh();
      }}
    >
      ออกจากระบบ
    </button>
  );
}
