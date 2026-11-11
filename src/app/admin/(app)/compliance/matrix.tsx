"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, input } from "@/components/ui";

type Opt = { value: string; label: string };

export function MatrixEditor({
  kind, canEdit, rows, cols, checked, confirmedAt,
}: {
  kind: "registrations" | "coverage";
  canEdit: boolean;
  rows: Opt[];
  cols: Opt[];
  checked: string[];
  confirmedAt: string | null;
}) {
  const router = useRouter();
  const [sel, setSel] = useState(new Set(checked));
  const [reason, setReason] = useState("");
  const [dlt, setDlt] = useState(confirmedAt ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const dirty = sel.size !== checked.length || checked.some((c) => !sel.has(c));

  function toggle(key: string) {
    const next = new Set(sel);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setSel(next);
  }

  async function save() {
    const pairs = [...sel].map((k) => k.split("|"));
    const body = kind === "registrations"
      ? { reason, items: pairs.map(([r, s]) => ({ registration_type: r, service_type: s, confirmed_by_dlt_at: dlt })) }
      : { reason, items: pairs.map(([l, c]) => ({ license_class: l, car_type: c })) };
    const res = await fetch(kind === "registrations" ? "/api/admin/allowed-registrations" : "/api/admin/license-coverage", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    setMsg(res.ok ? "บันทึกแล้ว" : "บันทึกไม่สำเร็จ");
    if (res.ok) {
      setReason("");
      router.refresh();
    }
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-muted">
              <th className="py-2 pr-3 text-left font-medium" />
              {cols.map((c) => <th key={c.value} className="px-2 py-2 text-center font-medium">{c.label}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map((r) => (
              <tr key={r.value}>
                <td className="py-2 pr-3">{r.label}</td>
                {cols.map((c) => {
                  const key = `${r.value}|${c.value}`;
                  return (
                    <td key={c.value} className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-sage"
                        checked={sel.has(key)}
                        disabled={!canEdit}
                        onChange={() => toggle(key)}
                        aria-label={`${r.label} – ${c.label}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && dirty && (
        <div className="flex flex-wrap items-end gap-3 rounded-xl bg-page p-3">
          {kind === "registrations" && (
            <label className="space-y-1">
              <span className="block text-xs text-muted">วันที่ ขบ. ยืนยัน</span>
              <input type="date" className={`${input} py-2`} value={dlt} onChange={(e) => setDlt(e.target.value)} />
            </label>
          )}
          <label className="min-w-60 flex-1 space-y-1">
            <span className="block text-xs text-muted">เหตุผล / อ้างอิงคำตอบ ขบ.</span>
            <input className={`${input} py-2`} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
          <button className={btnPrimary} disabled={reason.trim().length < 3 || (kind === "registrations" && !dlt)} onClick={save}>
            บันทึก
          </button>
        </div>
      )}
      {msg && <p className="text-sm text-muted">{msg}</p>}
    </div>
  );
}
