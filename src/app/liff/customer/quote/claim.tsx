"use client";

import { useEffect } from "react";

// §7.7 ข้อ 3: มาจาก landing พร้อม ?t=<touchpoint> → ผูกกับบัญชีที่ login แล้ว (ครั้งเดียว)
export function ClaimTouchpoint({ touchpointId }: { touchpointId: string }) {
  useEffect(() => {
    const key = `claimed:${touchpointId}`;
    try { if (sessionStorage.getItem(key)) return; } catch { /* ignore */ }
    fetch("/api/touchpoints/claim", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ touchpoint_id: touchpointId }),
    }).then(() => { try { sessionStorage.setItem(key, "1"); } catch { /* ignore */ } });
  }, [touchpointId]);
  return null;
}
