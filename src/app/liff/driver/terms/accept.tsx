"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary } from "@/components/ui";

export function AcceptTerms() {
  const router = useRouter();
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" className="mt-1 h-5 w-5 accent-sage" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        ฉันอ่านและยอมรับสัญญาผู้รับจ้างอิสระ และประกาศความเป็นส่วนตัวข้างต้น
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <button
        className={`${btnPrimary} w-full`}
        disabled={!checked || busy}
        onClick={async () => {
          setBusy(true);
          const res = await fetch("/api/me/terms", { method: "POST" });
          setBusy(false);
          if (!res.ok) return setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
          router.push("/liff/driver");
          router.refresh();
        }}
      >
        ยอมรับและเริ่มใช้งาน
      </button>
    </div>
  );
}
