"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { useI18n } from "./i18nContext";
import { input as inputCls } from "./ui";

// FR-BOOK-01 ลูกค้าระบุตำแหน่งเอง 3 แบบ: GPS มือถือ · ปักหมุดบนแผนที่ (OSM) · วางลิงก์/พิกัดจาก Google Maps
// ไม่มีค่าใช้จ่าย API · คนขับนำทางจากพิกัดนี้ · ช่องชื่อ = จุดสังเกตให้คนขับ

export type PickedPlace = { lat: number; lng: number; name: string; source: "gps" | "pin" | "link" };

const MapPicker = dynamic(() => import("./MapPicker").then((m) => m.MapPicker), { ssr: false });

export function LocationInput({
  label, value, onChange, required,
}: {
  label: string;
  value: PickedPlace | null;
  onChange: (p: PickedPlace | null) => void;
  required?: boolean;
}) {
  const { t } = useI18n();
  const L = t.location;
  const [mapOpen, setMapOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState<"gps" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);
  // ชื่อที่ระบบเติมให้ (ไม่ใช่ที่ลูกค้าพิมพ์เอง) → ย้ายจุดแล้วหาชื่อใหม่ได้
  const [autoNamed, setAutoNamed] = useState(false);
  // นับการเปลี่ยนแปลง: ผลหาชื่อที่มาช้า (ลูกค้าพิมพ์เอง/ย้ายจุดไปแล้ว) ต้องไม่ทับของใหม่
  const edits = useRef(0);

  const set = (p: { lat: number; lng: number }, source: PickedPlace["source"], name?: string) => {
    setError(null);
    const typed = value?.name && !autoNamed ? value.name : "";
    const picked = { lat: p.lat, lng: p.lng, source, name: name || typed };
    onChange(picked);
    const mine = ++edits.current;
    if (picked.name) return setAutoNamed(false);
    // ไม่มีชื่อ → หาชื่อสถานที่จากพิกัดมาเติม (คนขับอ่านง่ายกว่าพิกัด) · หาไม่ได้ก็ปล่อยว่าง
    setAutoNamed(true);
    void fetch("/api/places/reverse", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lat: p.lat, lng: p.lng }),
    }).then((r) => (r.ok ? r.json() : null)).then((out) => {
      if (out?.name && edits.current === mine) onChange({ ...picked, name: out.name });
    }).catch(() => {});
  };

  function useGps() {
    if (!navigator.geolocation) return setError(L.noGeo);
    setBusy("gps");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(null);
        set({ lat: pos.coords.latitude, lng: pos.coords.longitude }, "gps");
      },
      (e) => {
        setBusy(null);
        setError(({ 1: L.geoDenied, 2: L.geoUnavailable, 3: L.geoTimeout } as Record<number, string>)[e.code] ?? L.geoFailed);
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
      return setError(problem === "outside_thailand" ? L.outside : L.linkFailed);
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
        <div className="space-y-2 rounded-xl border-2 border-sage bg-card p-3">
          <div className="flex items-start justify-between gap-2 text-sm">
            <span>
              <span className="block font-medium text-ok">{L.got}</span>
              <span className="block text-xs text-muted">
                {value.lat.toFixed(5)}, {value.lng.toFixed(5)} ·{" "}
                <a className="underline" target="_blank" rel="noreferrer"
                  href={`https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=18/${value.lat}/${value.lng}`}>{L.viewMap}</a>
              </span>
            </span>
            <span className="flex shrink-0 gap-3">
              <button type="button" className="text-sage underline" onClick={() => setMapOpen(true)}>{L.adjust}</button>
              <button type="button" className="text-muted underline" onClick={() => { edits.current++; onChange(null); }}>{L.clear}</button>
            </span>
          </div>
          <input className={inputCls} maxLength={120} value={value.name}
            placeholder={L.namePh}
            aria-label={L.nameLabel(label)}
            onChange={(e) => { edits.current++; setAutoNamed(false); onChange({ ...value, name: e.target.value }); }} />
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" className={chip} onClick={useGps} disabled={busy === "gps"}>
            {busy === "gps" ? L.locating : L.gps}
          </button>
          <button type="button" className={chip} onClick={() => setMapOpen(true)}>{L.pin}</button>
          <button type="button" className={chip} onClick={() => setLinkOpen((v) => !v)} aria-expanded={linkOpen}>{L.link}</button>
        </div>
      )}

      {linkOpen && !value && (
        <div className="flex gap-2">
          <input className={inputCls} value={link} onChange={(e) => setLink(e.target.value)} inputMode="url"
            placeholder={L.linkPh} aria-label={L.linkLabel} />
          <button type="button" className="shrink-0 rounded-[var(--radius-btn)] bg-navy px-4 text-sm font-medium text-white disabled:opacity-60"
            onClick={useLink} disabled={busy === "link" || !link.trim()}>
            {busy === "link" ? L.reading : L.useLink}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-bad" role="alert">{error}</p>}

      {mapOpen && (
        <MapPicker
          initial={value}
          onClose={() => setMapOpen(false)}
          onConfirm={(p, name) => {
            set(p, "pin", name);
            setMapOpen(false);
          }}
        />
      )}
    </fieldset>
  );
}
