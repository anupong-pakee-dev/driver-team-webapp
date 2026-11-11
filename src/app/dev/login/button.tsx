"use client";

import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

export function DevLoginButton({ userId, next, children }: { userId: string; next: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="flex w-full items-center justify-between rounded-xl border border-line px-4 py-3 text-left hover:border-sage"
      onClick={async () => {
        const res = await fetch("/api/auth/dev", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user_id: userId }),
        });
        if (res.ok) {
          router.push(next);
          router.refresh();
        }
      }}
    >
      {children}
    </button>
  );
}
