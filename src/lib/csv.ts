// FR-REP-02 CSV สำหรับนักบัญชี — UTF-8 + BOM (Excel อ่านภาษาไทยได้) · กัน CSV/formula injection

const cell = (v: unknown): string => {
  if (v === null || v === undefined) return "";
  let s = v instanceof Date ? v.toISOString() : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCsv(headers: string[], rows: unknown[][]): string {
  return "﻿" + [headers, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

/** สตางค์ → บาททศนิยม 2 ตำแหน่ง (ตัวเลขล้วน ไม่มีคั่นหลักพัน) */
export const baht = (satang: number | string | null) => (satang === null ? "" : (Number(satang) / 100).toFixed(2));
