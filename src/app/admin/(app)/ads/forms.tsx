"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnPrimary, btnSecondary, input } from "@/components/ui";

const PLATFORMS = [["meta", "Facebook/Instagram"], ["google", "Google"], ["tiktok", "TikTok"], ["gbp", "Google Business Profile"],
  ["offline", "ออฟไลน์ (ป้าย/โบรชัวร์/QR)"], ["referral", "พาร์ทเนอร์/แนะนำ"], ["direct", "อื่นๆ"]] as const;
const SERVICES = [["", "สนามบิน (ค่าเริ่ม)"], ["airport_transfer", "สนามบิน"], ["daily_charter", "เหมารายวัน"], ["point_to_point", "ต่างจังหวัด"], ["hourly_charter", "เหมารายชั่วโมง"]] as const;

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, json: await res.json().catch(() => null) };
}

// FR-ADS-02
export function CampaignForm() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      const form = e.currentTarget;
      const f = new FormData(form);
      const s = (k: string) => (String(f.get(k) ?? "").trim() || null);
      const r = await post("/api/admin/campaigns", {
        slug: s("slug"), name: s("name"), platform: s("platform"), target: s("target"), service_type: s("service_type"),
        utm_source: s("utm_source"), utm_medium: s("utm_medium"), utm_campaign: s("utm_campaign"),
        start_at: s("start_at"), end_at: s("end_at"), status: "active",
      });
      if (!r.ok) return setMsg(r.json?.error?.details?.problem === "duplicate" ? "slug นี้มีแล้ว" : "ข้อมูลไม่ถูกต้อง — slug ใช้ a-z 0-9 และ - เท่านั้น");
      form.reset();
      setMsg("สร้างแล้ว");
      router.refresh();
    }}>
      <div className="grid grid-cols-2 gap-2">
        <input name="name" required placeholder="ชื่อแคมเปญ" className={input} />
        <input name="slug" required pattern="[a-z0-9][a-z0-9\-]*[a-z0-9]" placeholder="slug เช่น hotel-a-qr" className={input} />
        <select name="platform" required className={input} defaultValue="">
          <option value="" disabled>แพลตฟอร์ม…</option>
          {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <select name="target" className={input} defaultValue="landing">
          <option value="landing">ไปหน้า landing (เก็บที่มาได้ครบ)</option>
          <option value="line_oa">ไปเพิ่มเพื่อน LINE OA (นับคลิก)</option>
        </select>
        <select name="service_type" className={input} defaultValue="">
          {SERVICES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input name="utm_source" placeholder="utm_source" className={input} />
        <input name="utm_medium" placeholder="utm_medium" className={input} />
        <input name="utm_campaign" placeholder="utm_campaign" className={input} />
        <input name="start_at" type="date" className={input} aria-label="เริ่ม" />
        <input name="end_at" type="date" className={input} aria-label="สิ้นสุด" />
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <button className={`${btnPrimary} w-full`}>สร้างลิงก์ + QR</button>
    </form>
  );
}

// FR-ADS-04
export function SpendForm({ campaigns, today }: { campaigns: { id: string; name: string; platform: string }[]; today: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form className="space-y-2" onSubmit={async (e) => {
      e.preventDefault();
      const f = new FormData(e.currentTarget);
      const cid = String(f.get("campaign") ?? "");
      const camp = campaigns.find((c) => c.id === cid);
      const n = (k: string) => (f.get(k) ? Number(f.get(k)) : null);
      const r = await post("/api/admin/ad-spend", {
        date: f.get("date"), platform: camp?.platform ?? f.get("platform"), campaign_id: camp?.id ?? null,
        amount_satang: Math.round(Number(f.get("amount")) * 100), impressions: n("impressions"), clicks: n("clicks"),
      });
      setMsg(r.ok ? "บันทึกแล้ว (วันเดิมซ้ำ = แก้ยอด)" : "บันทึกไม่สำเร็จ");
      if (r.ok) router.refresh();
    }}>
      <div className="grid grid-cols-2 gap-2">
        <input name="date" type="date" required defaultValue={today} className={input} />
        <select name="campaign" className={input} defaultValue="">
          <option value="">ไม่ระบุแคมเปญ</option>
          {campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="platform" className={input} defaultValue="meta" aria-label="แพลตฟอร์ม (เมื่อไม่ระบุแคมเปญ)">
          {PLATFORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input name="amount" type="number" min={0} step="0.01" required placeholder="ค่าแอด (บาท)" className={input} />
        <input name="impressions" type="number" min={0} placeholder="impressions" className={input} />
        <input name="clicks" type="number" min={0} placeholder="clicks" className={input} />
      </div>
      {msg && <p className="text-sm text-muted">{msg}</p>}
      <button className={`${btnSecondary} w-full`}>บันทึก</button>
    </form>
  );
}

// FR-ADS-17 เช็กลิสต์ก่อนเผยแพร่
export function LandingPublish({ service, published, checks }: { service: string; published: boolean; checks: { key: string; label: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [sel, setSel] = useState<string[]>([]);
  if (published) {
    return <button className="text-xs text-bad underline" onClick={async () => { await post(`/api/admin/landing/${service}`, { publish: false }); router.refresh(); }}>หยุดเผยแพร่</button>;
  }
  if (!open) return <button className={btnSecondary} onClick={() => setOpen(true)}>ตรวจเช็กลิสต์แล้วเผยแพร่</button>;
  return (
    <div className="w-full space-y-2 rounded-xl bg-page p-3">
      {checks.map((c) => (
        <label key={c.key} className="flex items-start gap-2">
          <input type="checkbox" className="mt-0.5 h-5 w-5 accent-navy" checked={sel.includes(c.key)}
            onChange={(e) => setSel(e.target.checked ? [...sel, c.key] : sel.filter((x) => x !== c.key))} />
          <span>{c.label}</span>
        </label>
      ))}
      <button className={btnPrimary} disabled={sel.length !== checks.length} onClick={async () => {
        await post(`/api/admin/landing/${service}`, { publish: true, checks: sel });
        router.refresh();
      }}>ยืนยันครบทุกข้อ → เผยแพร่</button>
    </div>
  );
}
