// §7.5 Payout (FR-PAYOUT-01, Req §3.7) — กฎล้วน · เงินเป็นสตางค์ · ปัดด้วย Math.round

export type PayoutRules = {
  commissionRate: number;                       // ⚙️ 0.20
  /** ❓ อัตราหัก ณ ที่จ่ายจากนักบัญชี — null = ยังไม่ตั้ง (คิด 0 และเตือน) */
  whtRate: number | null;
  /** ❓ ฐานคำนวณหัก ณ ที่จ่าย */
  whtBase: "gross" | "after_commission";
  /** ❓ T9 งานยกเลิก/no-show หักค่าคอมจากส่วนคนขับไหม */
  commissionOnCancellation: boolean;
  penaltiesEnabled: boolean;
};

export type PayoutItemInput = {
  kind: "job" | "cancellation";
  grossSatang: number;          // job: ค่างานที่ลูกค้าจ่ายจริง (ไม่รวมเบิกคืน) · cancellation: ส่วนคนขับจาก §7.4
  reimburseSatang?: number;     // ทางด่วน ค่าจอด — ไม่หักค่าคอม
  penaltiesSatang?: number;     // ใช้เมื่อ penaltiesEnabled เท่านั้น
};

export type PayoutItem = {
  gross: number; commission: number; withholding: number; penalties: number; reimburse: number; net: number;
};

export function payoutItem(i: PayoutItemInput, r: PayoutRules): PayoutItem {
  const gross = i.grossSatang;
  const commission = i.kind === "cancellation" && !r.commissionOnCancellation ? 0 : Math.round(gross * r.commissionRate);
  const base = r.whtBase === "gross" ? gross : gross - commission;
  const withholding = r.whtRate ? Math.round(base * r.whtRate) : 0;
  const penalties = r.penaltiesEnabled ? (i.penaltiesSatang ?? 0) : 0;
  const reimburse = i.reimburseSatang ?? 0;
  return { gross, commission, withholding, penalties, reimburse, net: gross - commission - penalties - withholding + reimburse };
}

export function sumItems(items: PayoutItem[]): PayoutItem {
  return items.reduce(
    (s, x) => ({
      gross: s.gross + x.gross, commission: s.commission + x.commission, withholding: s.withholding + x.withholding,
      penalties: s.penalties + x.penalties, reimburse: s.reimburse + x.reimburse, net: s.net + x.net,
    }),
    { gross: 0, commission: 0, withholding: 0, penalties: 0, reimburse: 0, net: 0 },
  );
}
