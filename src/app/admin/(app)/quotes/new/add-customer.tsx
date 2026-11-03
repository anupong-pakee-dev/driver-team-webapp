"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { btnSecondary, input } from "@/components/ui";

export function AddCustomer() {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <form
      className="grid gap-2 sm:grid-cols-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const f = new FormData(form);
        const res = await fetch("/api/admin/customers", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ display_name: f.get("display_name"), full_name: f.get("full_name"), phone: f.get("phone") }),
        });
        if (!res.ok) return setMsg("เพิ่มไม่สำเร็จ — ตรวจเบอร์โทร");
        form.reset();
        setMsg("เพิ่มแล้ว — เลือกจากรายการลูกค้าด้านล่าง");
        router.refresh();
      }}
    >
      <input name="display_name" required placeholder="ชื่อที่ใช้เรียก" className={input} />
      <input name="full_name" required placeholder="ชื่อ-นามสกุล" className={input} />
      <input name="phone" required placeholder="เบอร์โทร" inputMode="tel" className={input} />
      <button className={btnSecondary}>เพิ่มลูกค้า</button>
      {msg && <p className="text-sm text-muted sm:col-span-4">{msg}</p>}
    </form>
  );
}
