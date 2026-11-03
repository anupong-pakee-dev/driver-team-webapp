"use client";

import { useRouter } from "next/navigation";

export function RetryOutbox({ id }: { id: string }) {
  const router = useRouter();
  return (
    <button className="rounded-lg border border-line px-2.5 py-1.5 text-xs" onClick={async () => {
      await fetch(`/api/admin/outbox/${id}/retry`, { method: "POST" });
      router.refresh();
    }}>ส่งอีกครั้ง</button>
  );
}
