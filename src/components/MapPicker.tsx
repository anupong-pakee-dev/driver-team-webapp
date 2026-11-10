"use client";

import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import type { Map as LeafletMap } from "leaflet";
import { useI18n } from "./I18nProvider";
import { btnPrimary, btnSecondary } from "./ui";

// ปักหมุดบนแผนที่ OpenStreetMap (ฟรี ไม่ใช้ key) — หมุดอยู่กลางจอ เลื่อนแผนที่ให้หมุดตรงจุด
// นโยบาย tile ของ OSM: แสดงเครดิต · ใช้ในปริมาณพอเหมาะ (หน้าขอราคาเท่านั้น)

const BANGKOK = { lat: 13.7563, lng: 100.5018 };

export function MapPicker({
  initial, onConfirm, onClose,
}: {
  initial: { lat: number; lng: number } | null;
  onConfirm: (p: { lat: number; lng: number }) => void;
  onClose: () => void;
}) {
  const { t } = useI18n();
  const L = t.location;
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const [center, setCenter] = useState(initial ?? BANGKOK);
  const [locating, setLocating] = useState(false);

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
        <p className="text-center text-xs text-muted">{center.lat.toFixed(5)}, {center.lng.toFixed(5)}</p>
        <div className="flex gap-2">
          <button type="button" className={`${btnSecondary} flex-1`} onClick={onClose}>{t.common.cancel}</button>
          <button type="button" className={`${btnPrimary} flex-1`} onClick={() => onConfirm(center)}>{L.useHere}</button>
        </div>
      </div>
    </div>
  );
}
