"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// สวิตช์เปิด/ปิดรับงาน: on = ได้ข้อเสนองาน · off = ไม่ได้ข้อเสนองานใหม่
export function AcceptingSwitch({ on }: { on: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(on);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);

  async function toggle() {
    const next = !value;
    setBusy(true);
    setError(false);
    const res = await fetch("/api/me/accepting", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ on: next }),
    });
    setBusy(false);
    if (!res.ok) return setError(true);
    setValue(next);
    router.refresh();
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      aria-label="รับงาน"
      disabled={busy}
      onClick={toggle}
      className={"flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3 text-[0.8125rem] font-semibold disabled:opacity-60 " +
        (value ? "bg-sage-soft text-sage" : "bg-chip text-muted")}
    >
      <span className={"relative h-5 w-9 rounded-full transition-colors " + (value ? "bg-sage" : "bg-line")} aria-hidden="true">
        <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all " + (value ? "left-[1.125rem]" : "left-0.5")} />
      </span>
      {error ? "ลองใหม่" : value ? "ON · รับงาน" : "OFF · ไม่รับงาน"}
    </button>
  );
}
