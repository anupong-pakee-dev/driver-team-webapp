"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

export function SettingEditor({ settingKey, initial, canEdit }: { settingKey: string; initial: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(initial);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-3">
        <pre className="min-w-0 flex-1 overflow-x-auto rounded-lg bg-page px-3 py-2 font-mono text-xs">{initial}</pre>
        {canEdit && (
          <button className={btnSecondary} onClick={() => setEditing(true)}>
            แก้ไข
          </button>
        )}
      </div>
    );
  }

  async function save() {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(value);
    } catch {
      return setError("รูปแบบ JSON ไม่ถูกต้อง");
    }
    const res = await fetch(`/api/admin/settings/${encodeURIComponent(settingKey)}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ value: parsed, reason }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      return setError(body?.error?.message_th ?? "บันทึกไม่สำเร็จ");
    }
    setEditing(false);
    setReason("");
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <textarea
        className={`${input} font-mono text-xs`}
        rows={Math.min(14, value.split("\n").length + 1)}
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <input className={input} placeholder="เหตุผลที่แก้ (บังคับ)" value={reason} onChange={(e) => setReason(e.target.value)} />
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={reason.trim().length < 3} onClick={save}>
          บันทึก
        </button>
        <button
          className={btnSecondary}
          onClick={() => {
            setEditing(false);
            setValue(initial);
          }}
        >
          ยกเลิก
        </button>
      </div>
    </div>
  );
}
