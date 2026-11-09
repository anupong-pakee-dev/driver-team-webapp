"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { input as inputCls } from "./ui";

// FR-BOOK-01 ลูกค้าระบุตำแหน่งเอง 3 แบบ: GPS มือถือ · ปักหมุดบนแผนที่ (OSM) · วางลิงก์/พิกัดจาก Google Maps
// ไม่มีค่าใช้จ่าย API · คนขับนำทางจากพิกัดนี้ · ช่องชื่อ = จุดสังเกตให้คนขับ

export type PickedPlace = { lat: number; lng: number; name: string; source: "gps" | "pin" | "link" };

const MapPicker = dynamic(() => import("./MapPicker").then((m) => m.MapPicker), { ssr: false });

const GEO_ERROR: Record<number, string> = {
  1: "ไม่ได้รับอนุญาตให้ใช้ตำแหน่ง — เปิดสิทธิ์ตำแหน่งให้ LINE หรือใช้ปักหมุดแทน",
  2: "หาตำแหน่งไม่ได้ ลองใหม่ในที่โล่ง หรือใช้ปักหมุดแทน",
  3: "หาตำแหน่งนานเกินไป ลองใหม่ หรือใช้ปักหมุดแทน",
};

export function LocationInput({
  label, value, onChange, required,
}: {
  label: string;
  value: PickedPlace | null;
  onChange: (p: PickedPlace | null) => void;
  required?: boolean;
}) {
  const [mapOpen, setMapOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"gps" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const set = (p: { lat: number; lng: number }, source: PickedPlace["source"], name?: string) => {
    setError(null);
    onChange({ lat: p.lat, lng: p.lng, source, name: name ?? value?.name ?? "" });
  };

  function useGps() {
    if (!navigator.geolocation) return setError("อุปกรณ์นี้ไม่รองรับ GPS — ใช้ปักหมุดแทน");
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        set({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "gps");
      },
      (e) => {
        setBusy(null);
        setError(GEO_ERROR[e.code] ?? "หาตำแหน่งไม่ได้");
      },
      { enableHighAccuracy: true, timeout: 15_000, maximumAge: 30_000 },
    );
  }

  async function useLink() {
    if (!link.trim()) return;
    setBusy("link");
    const res = await fetch("/api/places/resolve-link", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ link }),
    });
    const out = await res.json().catch(() => null);
    setBusy(null);
    if (!res.ok) {
      const problem = out?.error?.details?.problem;
      return setError(problem === "outside_thailand" ? "ตำแหน่งนี้อยู่นอกประเทศไทย"
        : "อ่านพิกัดจากลิงก์นี้ไม่ได้ — ในแอป Google Maps ให้กดค้างที่จุดนั้นจนขึ้นหมุดแดง แล้วกดแชร์ หรือใช้ปักหมุดแทน");
    }
    set(out, "link", value?.name || out.name);
    setLinkOpen(false);
    setLink("");
  }

  const chip = "rounded-full border border-line bg-card px-3 py-2 text-sm font-medium disabled:opacity-60";

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}{required && <span className="text-bad"> *</span>}</legend>

      {value ? (
        <div className="space-y-2 rounded-xl border-2 border-navy bg-card p-3">
          <div className="flex items-start justify-between gap-2 text-sm">
            <span>
              <span className="block font-medium text-ok">✓ ได้ตำแหน่งแล้ว</span>
              <span className="block text-xs text-muted">
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)} ·{" "}
                <a className="underline" target="_blank" rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=18/${value.lat}/${value.lng}`}>ดูบนแผนที่</a>
              </span>
            </span>
            <span className="flex shrink-0 gap-3">
              <button type="button" className="text-navy underline" onClick={() => setMapOpen(true)}>ปรับหมุด</button>
              <button type="button" className="text-muted underline" onClick={() => onChange(null)}>ล้าง</button>
            </span>
          </div>
          <input className={inputCls} maxLength={120} value={value.name}
            placeholder="ชื่อสถานที่ / จุดสังเกต เช่น คอนโด ABC ตึก B, หน้าเซเว่น"
            aria-label={`${label} — ชื่อสถานที่หรือจุดสังเกต`}
            onChange={(e) => onChange({ ...value, name: e.target.value })} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip} onClick={useGps} disabled={busy === "gps"}>
            {busy === "gps" ? "กำลังหาตำแหน่ง…" : "📍 ตำแหน่งปัจจุบัน"}
          </button>
          <button type="button" className={chip} onClick={() => setMapOpen(true)}>🗺️ ปักหมุดบนแผนที่</button>
          <button type="button" className={chip} onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen}>🔗 วางลิงก์ Google Maps</button>
        </div>
      )}

      {linkOpen && !value && (
        <div className="flex gap-2">
          <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} inputMode="url"
            placeholder="วางลิงก์ที่แชร์จาก Google Maps หรือพิกัด 13.7462, 100.5347" aria-label="ลิงก์ Google Maps หรือพิกัด" />
          <button type="button" className="shrink-0 rounded-[var(--radius-btn)] bg-navy px-4 text-sm font-medium text-white disabled:opacity-60"
            onClick={useLink} disabled={busy === "link" || !link.trim()}>
            {busy === "link" ? "กำลังอ่าน…" : "ใช้ลิงก์นี้"}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-bad" role="alert">{error}</p>}

      {mapOpen && (
        <MapPicker
          initial={value}
          onClose={() => setMapOpen(false)}
          onConfirm={(p) => {
            set(p, "pin");
            setMapOpen(false);
          }}
        />
      )}
    </fieldset>
  );
}
