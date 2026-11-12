"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { haversineM } from "@/domain/geo";
import { useI18n } from "./i18nContext";
import { btnPrimary, btnSecondary, input } from "./ui";

// ปักหมุดบนแผนที่ OpenStreetMap (ฟรี ไม่ใช้ key) — หมุดอยู่กลางจอ เลื่อนแผนที่ให้หมุดตรงจุด
// นโยบาย tile ของ OSM: แสดงเครดิต · ใช้ในปริมาณพอเหมาะ (หน้าขอราคาเท่านั้น)
// ค้นหาสถานที่: กดค้นหาเท่านั้น (ไม่ค้นทุกตัวอักษร) → เลือกผล → แผนที่เลื่อนไปที่นั่น · ใช้ชื่อนั้นถ้าไม่ได้เลื่อนออกไปไกล

const BANGKOK = { lat: 13.7563, lng: 100.5018 };

export function MapPicker({
  initial, onConfirm, onClose,
}: {
  initial: { lat: number; lng: number } | null;
  onConfirm: (p: { lat: number; lng: number }, name?: string) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const L = t.location;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [center, setCenter] = useState(initial ?? BANGKOK);
  const [locating, setLocating] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ lat: number; lng: number; name: string; detail: string }[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const [chosen, setChosen] = useState<{ lat: number; lng: number; name: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current || map.current) return;
      const start = initial ?? BANGKOK;
      const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView([start.lat, start.lng], initial ? 17 : 11);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>',
      }).addTo(m);
      m.on("move", () => {
        const c = m.getCenter();
        setCenter({ lat: c.lat, lng: c.lng });
      });
      map.current = m;
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // แผนที่สร้างครั้งเดียวตอนเปิด
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ไม่ใช้ <form> — แผนที่อยู่ในฟอร์มขอราคา ฟอร์มซ้อนกันจะส่งฟอร์มขอราคาไปด้วย
  async function search() {
    if (query.trim().length < 2) return;
    setSearching(true);
    setSearchError(false);
    const res = await fetch("/api/places/search", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ q: query.trim() }),
    }).catch(() => null);
    setSearching(false);
    if (!res?.ok) return setSearchError(true);
    setHits(((await res.json()) as { results: { lat: number; lng: number; name: string; detail: string }[] }).results);
  }

  function pick(h: { lat: number; lng: number; name: string }) {
    setHits(null);
    setChosen(h);
    map.current?.setView([h.lat, h.lng], 17);
  }

  // ชื่อจากผลค้นหาใช้ได้ถ้าหมุดยังอยู่ใกล้จุดนั้น (เลื่อนออกไปเกิน ~60 ม. = ให้ระบบหาชื่อจากพิกัดใหม่)
  const chosenName = chosen && haversineM(chosen, center) < 60 ? chosen.name : undefined;

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        map.current?.setView([pos.coords.latitude, pos.coords.longitude], 17);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-card" role="dialog" aria-modal="true" aria-label={L.mapLabel}>
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <p className="text-sm font-medium">{L.mapTitle}</p>
        <button type="button" className="text-sm text-muted" onClick={onClose}>{L.close}</button>
      </div>
      <div className="relative z-[1001] flex gap-2 border-b border-line px-4 py-2.5" role="search">
        <input className={`${input} py-2`} value={query} onChange={(e) => setQuery(e.target.value)} maxLength={100}
          placeholder={L.searchPh} aria-label={L.searchPh} enterKeyHint="search"
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); void search(); } }} />
        <button type="button" onClick={() => void search()} disabled={searching || query.trim().length < 2}
          className="shrink-0 rounded-[var(--radius-btn)] bg-navy px-4 text-sm font-medium text-white disabled:opacity-60">
          {searching ? L.searching : L.search}
        </button>
        {(hits || searchError) && (
          <div className="absolute inset-x-4 top-full mt-1 max-h-72 overflow-auto rounded-xl border border-line bg-card shadow-lg" role="listbox" aria-label={L.search}>
            {searchError ? <p className="px-3 py-2.5 text-sm text-bad">{L.searchFailed}</p>
              : hits!.length === 0 ? <p className="px-3 py-2.5 text-sm text-muted">{L.noResults}</p>
              : hits!.map((h, i) => (
                <button key={`${h.lat},${h.lng},${i}`} type="button" role="option" aria-selected={false} onClick={() => pick(h)}
                  className="block w-full border-b border-line px-3 py-2.5 text-left last:border-0 hover:bg-page">
                  <span className="block text-sm font-medium">{h.name}</span>
                  {h.detail && <span className="block text-xs text-muted">{h.detail}</span>}
                </button>
              ))}
          </div>
        )}
      </div>
      <div className="relative flex-1">
        <div ref={el} className="absolute inset-0" />
        {/* หมุดกลางจอ (ปลายหมุด = จุดกึ่งกลางแผนที่) */}
        <svg aria-hidden="true" viewBox="0 0 24 36" className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] h-10 w-7 -translate-x-1/2 -translate-y-full drop-shadow">
          <path d="M12 0C5.4 0 0 5.3 0 11.9 0 20.8 12 36 12 36s12-15.2 12-24.1C24 5.3 18.6 0 12 0z" fill="var(--color-navy)" />
          <circle cx="12" cy="12" r="4.5" fill="var(--color-amber)" />
        </svg>
        <button type="button" onClick={locate} disabled={locating}
          className="absolute bottom-4 right-4 z-[1000] rounded-full border border-line bg-card px-4 py-2 text-sm font-medium shadow">
          {locating ? L.locating : L.gps}
        </button>
      </div>
      <div className="space-y-2 border-t border-line px-4 py-3">
        <p className="text-center text-xs text-muted">{chosenName ? <><span className="font-medium text-ink">{chosenName}</span> · </> : null}{center.lat.toFixed(5)}, {center.lng.toFixed(5)}</p>
        <div className="flex gap-2">
          <button type="button" className={`${btnSecondary} flex-1`} onClick={onClose}>{t.common.cancel}</button>
          <button type="button" className={`${btnPrimary} flex-1`} onClick={() => onConfirm(center, chosenName)}>{L.useHere}</button>
        </div>
      </div>
    </div>
  );
}
