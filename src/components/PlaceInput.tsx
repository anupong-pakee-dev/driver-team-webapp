"use client";

import { useEffect, useId, useRef, useState } from "react";
import { input as inputCls } from "./ui";

export type PickedPlace = { place_id: string; name: string };

// FR-BOOK-01 ค้นสถานที่ด้วย autocomplete (ผ่าน /api/places/autocomplete)
export function PlaceInput({
  label, value, onChange, sessionToken, placeholder, required,
}: {
  label: string;
  value: PickedPlace | null;
  onChange: (p: PickedPlace | null) => void;
  sessionToken: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [text, setText] = useState(value?.name ?? "");
  const [items, setItems] = useState<{ place_id: string; name: string; secondary?: string }[]>([]);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listId = useId();

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function search(q: string) {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) return setItems([]);
    timer.current = setTimeout(async () => {
      const res = await fetch(`/api/places/autocomplete?q=${encodeURIComponent(q)}&session=${sessionToken}`);
      if (res.ok) {
        setItems((await res.json()).suggestions);
        setOpen(true);
      }
    }, 250);
  }

  return (
    <label className="relative block space-y-1">
      <span className="text-sm font-medium">{label}{required && <span className="text-bad"> *</span>}</span>
      <input
        className={`${inputCls} ${value ? "border-navy" : ""}`}
        value={text}
        placeholder={placeholder ?? "พิมพ์ชื่อสถานที่ / โรงแรม / ที่อยู่"}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        onChange={(e) => {
          setText(e.target.value);
          if (value) onChange(null);
          search(e.target.value);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onFocus={() => items.length && setOpen(true)}
      />
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-line bg-card shadow-lg">
          {items.map((it) => (
            <li key={it.place_id} role="option" aria-selected={value?.place_id === it.place_id}>
              <button
                type="button"
                className="block w-full px-3.5 py-2.5 text-left hover:bg-page"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ place_id: it.place_id, name: it.name });
                  setText(it.name);
                  setOpen(false);
                }}
              >
                <span className="block font-medium">{it.name}</span>
                {it.secondary && <span className="block text-xs text-muted">{it.secondary}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  );
}
