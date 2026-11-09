// §9.2 adapter ข ตรวจสลิป (BR-PAY-01): ผู้รับ = บัญชีบริษัท · ยอด ≥ ที่ต้องจ่าย · โอนหลังสร้างรายการ · เลขอ้างอิงไม่ซ้ำ
// ผู้ให้บริการ API ตรวจสลิปคืนข้อมูลสลิป → ฟังก์ชันนี้ตัดสิน (แยกจากผู้ให้บริการ เปลี่ยนเจ้าได้)

export type SlipData = {
  ref: string;                 // เลขอ้างอิงธุรกรรม
  amountSatang: number;
  receiverAccounts: string[];  // เลขบัญชี/พร้อมเพย์ของผู้รับที่ผู้ให้บริการอ่านได้ (อาจปิดบางหลัก เช่น xxx-x-x1234-x)
  transferredAt: Date;
};

export type SlipReason = "AMOUNT_MISMATCH" | "RECEIVER_MISMATCH" | "DUPLICATE" | "TOO_OLD";

const digits = (s: string) => s.replace(/[^\dx]/gi, "").toLowerCase();

/** เทียบเลขบัญชีที่อาจถูกปิดบางหลักด้วย x กับบัญชีบริษัท (เทียบเฉพาะหลักที่เห็น) */
export function accountMatches(masked: string, actual: string): boolean {
  const m = digits(masked);
  const a = digits(actual);
  if (!m || m.length !== a.length) {
    // บางธนาคารแสดงแค่ท้าย 4 หลัก
    const tail = m.replace(/x/g, "");
    return tail.length >= 4 && a.endsWith(tail);
  }
  return [...m].every((c, i) => c === "x" || c === a[i]);
}

export function checkSlip(
  slip: SlipData,
  expect: { amountSatang: number; companyAccounts: string[]; notBefore: Date; refAlreadyUsed: boolean },
): SlipReason | null {
  if (expect.refAlreadyUsed) return "DUPLICATE";
  const receiverOk = slip.receiverAccounts.some((r) => expect.companyAccounts.some((c) => accountMatches(r, c)));
  if (!receiverOk) return "RECEIVER_MISMATCH";
  if (slip.amountSatang < expect.amountSatang) return "AMOUNT_MISMATCH";
  // เผื่อเวลานาฬิกาคลาด 5 นาที
  if (slip.transferredAt.getTime() < expect.notBefore.getTime() - 5 * 60_000) return "TOO_OLD";
  return null;
}
