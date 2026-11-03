"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { DocType } from "@/domain/documents";
import { btnPrimary, btnSecondary, input } from "./ui";

type Opt = { code: string; label_th: string };

// FR-DRV-02 / FR-VEH-01..03: กรอกข้อมูลคู่กับไฟล์ แล้วส่งให้ owner ตรวจ
export function DocUploader({
  ownerType, ownerId, def, options, label = "ส่งเอกสาร", subtle = false,
}: {
  ownerType: "driver" | "vehicle";
  ownerId: string;
  def: DocType;
  options: { registration_types: Opt[]; license_classes: Opt[] };
  label?: string;
  /** เอกสารผ่านแล้ว → ปุ่มเล็กแบบลิงก์ */
  subtle?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button type="button" className={subtle ? "text-sm text-navy underline underline-offset-2" : btnSecondary} onClick={() => setOpen(true)}>
        {label}
      </button>
    );
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const fields: Record<string, string> = {};
    for (const field of def.fields) fields[field.key] = String(f.get(field.key) ?? "");
    const body = new FormData();
    body.set("owner_type", ownerType);
    body.set("owner_id", ownerId);
    body.set("doc_type", def.type);
    body.set("fields", JSON.stringify(fields));
    body.set("file", f.get("file") as File);
    setBusy(true);
    const res = await fetch("/api/me/documents", { method: "POST", body });
    setBusy(false);
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      const d = err?.error?.details;
      const field = def.fields.find((x) => x.key === d?.field)?.label;
      return setError(
        d?.file === "size" ? "ไฟล์ใหญ่เกิน 10 MB"
          : d?.file === "type" ? "รองรับเฉพาะรูป JPG/PNG/WebP หรือ PDF"
          : field ? `กรุณาตรวจช่อง "${field}"`
          : err?.error?.message_th ?? "ส่งไม่สำเร็จ",
      );
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3 rounded-xl bg-page p-3">
      {def.hint && <p className="text-sm text-muted">{def.hint}</p>}
      {def.fields.map((field) => {
        const opts = Array.isArray(field.options)
          ? field.options.map((o) => ({ code: o.value, label_th: o.label }))
          : field.options ? options[field.options] : null;
        return (
          <label key={field.key} className="block space-y-1">
            <span className="text-sm font-medium">
              {field.label}
              {field.required && <span className="text-bad"> *</span>}
            </span>
            {opts ? (
              <select name={field.key} required={field.required} className={input} defaultValue="">
                <option value="" disabled>เลือก…</option>
                {opts.map((o) => <option key={o.code} value={o.code}>{o.label_th}</option>)}
              </select>
            ) : (
              <input
                name={field.key}
                required={field.required}
                className={input}
                type={field.type === "date" ? "date" : field.type === "money" ? "number" : field.type === "phone" ? "tel" : "text"}
                inputMode={field.type === "money" || field.type === "secret" ? "numeric" : undefined}
                autoComplete="off"
              />
            )}
          </label>
        );
      })}
      <label className="block space-y-1">
        <span className="text-sm font-medium">ไฟล์ (รูปหรือ PDF ≤ 10 MB) <span className="text-bad">*</span></span>
        <input name="file" type="file" required accept="image/jpeg,image/png,image/webp,application/pdf" className="block w-full text-sm" />
      </label>
      {error && <p className="text-sm text-bad">{error}</p>}
      <div className="flex gap-2">
        <button className={btnPrimary} disabled={busy}>{busy ? "กำลังส่ง…" : "ส่งให้ตรวจ"}</button>
        <button type="button" className={btnSecondary} onClick={() => setOpen(false)}>ยกเลิก</button>
      </div>
    </form>
  );
}
