"use client";

import { useRouter } from "next/navigation";
import { useI18n } from "./I18nProvider";

export function LogoutButton({ to = "/", className = "" }: { to?: string; className?: string }) {
  const router = useRouter();
  const { t } = useI18n();
  return (
    <button
      type="button"
      className={className || "rounded-full bg-chip px-3 py-1.5 text-sm font-medium"}
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" });
        router.push(to);
        router.refresh();
      }}
    >
      {t.common.logout}
    </button>
  );
}
