// FR-DRV-02, FR-VEH-01..03: ประเภทเอกสาร ช่องข้อมูลที่กรอกคู่กัน และผลเมื่ออนุมัติ
// กฎล้วน ไม่มี I/O — service เป็นผู้เข้ารหัส/เขียน DB

export type OwnerType = "driver" | "vehicle";
export type FieldType = "date" | "text" | "phone" | "money" | "select" | "secret";

export type Field = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  /** ตัวเลือกคงที่ หรือชื่อ settings key ที่เก็บรายการ */
  options?: { value: string; label: string }[] | "registration_types" | "license_classes";
};

export type DocType = {
  type: string;
  owner: OwnerType;
  label: string;
  hint?: string;
  fields: Field[];
  /** ช่องที่เป็นวันหมดอายุของเอกสาร → documents.expires_at (ใช้แจ้งเตือน FR-VEH-05) */
  expiryField?: string;
};

export const INSURANCE_USAGE = [
  { value: "commercial_hire", label: "รับจ้าง" },
  { value: "rental", label: "ให้เช่า" },
  { value: "public", label: "สาธารณะ" },
  { value: "private", label: "ส่วนบุคคล (รับงานไม่ได้)" },
];

export const DOC_TYPES: DocType[] = [
  { type: "id_card", owner: "driver", label: "บัตรประชาชน", fields: [] },
  {
    type: "public_license", owner: "driver", label: "ใบขับขี่สาธารณะ", expiryField: "expiry",
    fields: [
      { key: "license_no", label: "เลขที่ใบขับขี่", type: "secret", required: true },
      { key: "license_class", label: "ประเภทใบขับขี่", type: "select", required: true, options: "license_classes" },
      { key: "expiry", label: "วันหมดอายุ", type: "date", required: true },
    ],
  },
  { type: "selfie_with_id", owner: "driver", label: "รูปถ่ายคู่บัตรประชาชน", hint: "ถือบัตรข้างหน้า เห็นหน้าและบัตรชัด", fields: [] },
  {
    type: "bank_book", owner: "driver", label: "หน้าสมุดบัญชีธนาคาร",
    fields: [
      { key: "bank_name", label: "ธนาคาร", type: "text", required: true },
      { key: "account_no", label: "เลขบัญชี", type: "secret", required: true },
    ],
  },
  {
    type: "registration_book", owner: "vehicle", label: "สำเนาเล่มทะเบียน",
    fields: [
      { key: "registration_type", label: "ประเภทจดทะเบียน", type: "select", required: true, options: "registration_types" },
      { key: "owner_name", label: "ชื่อผู้ถือกรรมสิทธิ์", type: "text", required: true },
    ],
  },
  { type: "compulsory_ins", owner: "vehicle", label: "พ.ร.บ.", expiryField: "expiry",
    fields: [{ key: "expiry", label: "วันหมดอายุ", type: "date", required: true }] },
  {
    type: "voluntary_ins", owner: "vehicle", label: "ประกันภาคสมัครใจ", expiryField: "expiry",
    fields: [
      { key: "insurer", label: "บริษัทประกัน", type: "text", required: true },
      { key: "policy_no", label: "เลขกรมธรรม์", type: "text", required: true },
      { key: "usage", label: "ประเภทการใช้รถ", type: "select", required: true, options: INSURANCE_USAGE },
      { key: "expiry", label: "วันหมดอายุ", type: "date", required: true },
      { key: "claim_phone", label: "เบอร์แจ้งเคลม", type: "phone", required: true },
    ],
  },
  {
    type: "passenger_ins", owner: "vehicle", label: "ประกันผู้โดยสาร", expiryField: "expiry",
    fields: [
      { key: "sum_baht", label: "ทุนประกันต่อที่นั่ง (บาท)", type: "money", required: true },
      { key: "expiry", label: "วันหมดอายุ", type: "date", required: true },
    ],
  },
  { type: "tax_receipt", owner: "vehicle", label: "ป้ายภาษี / ใบเสร็จภาษีรถ", expiryField: "expiry",
    fields: [{ key: "expiry", label: "วันหมดอายุภาษี", type: "date", required: true }] },
  { type: "inspection", owner: "vehicle", label: "ใบรับรองตรวจสภาพ", expiryField: "due",
    fields: [{ key: "due", label: "ครบกำหนดตรวจครั้งถัดไป", type: "date", required: true }] },
  { type: "vehicle_photo", owner: "vehicle", label: "รูปรถ (เห็นป้ายทะเบียน)", fields: [] },
];

export const docType = (type: string) => DOC_TYPES.find((d) => d.type === type);

export class DocDataError extends Error {
  constructor(public field: string, public problem: "required" | "invalid") {
    super(`${field}: ${problem}`);
  }
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** ตรวจข้อมูลที่กรอกกับเอกสาร → แยกค่าทั่วไป/ค่าลับ + วันหมดอายุ */
export function parseDocData(
  type: DocType,
  input: Record<string, unknown>,
  allowed: { registration_types: string[]; license_classes: string[] },
): { data: Record<string, string | number>; secret: Record<string, string>; expiresAt: string | null } {
  const data: Record<string, string | number> = {};
  const secret: Record<string, string> = {};
  for (const f of type.fields) {
    const raw = input[f.key];
    const v = typeof raw === "string" ? raw.trim() : raw;
    if (v === undefined || v === null || v === "") {
      if (f.required) throw new DocDataError(f.key, "required");
      continue;
    }
    switch (f.type) {
      case "date":
        if (typeof v !== "string" || !DATE.test(v) || Number.isNaN(Date.parse(v))) throw new DocDataError(f.key, "invalid");
        data[f.key] = v;
        break;
      case "money": {
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new DocDataError(f.key, "invalid");
        data[f.key] = Math.round(n * 100); // เก็บเป็นสตางค์
        break;
      }
      case "select": {
        const values = Array.isArray(f.options) ? f.options.map((o) => o.value) : allowed[f.options!];
        if (typeof v !== "string" || !values.includes(v)) throw new DocDataError(f.key, "invalid");
        data[f.key] = v;
        break;
      }
      case "phone":
        if (typeof v !== "string" || !/^[+\d][\d\s-]{2,19}$/.test(v)) throw new DocDataError(f.key, "invalid");
        data[f.key] = v;
        break;
      case "secret":
        if (typeof v !== "string" || v.length > 64) throw new DocDataError(f.key, "invalid");
        secret[f.key] = v.replace(/[\s-]/g, "");
        break;
      default:
        if (typeof v !== "string" || v.length > 200) throw new DocDataError(f.key, "invalid");
        data[f.key] = v;
    }
  }
  const expiresAt = type.expiryField ? ((data[type.expiryField] as string | undefined) ?? null) : null;
  return { data, secret, expiresAt };
}

/** เมื่อ owner อนุมัติ: คอลัมน์ที่ต้องอัปเดตใน drivers / vehicles (ค่า secret ส่งออกเป็น plain — service เข้ารหัส) */
export function approvalPatch(type: string, data: Record<string, unknown>, secret: Record<string, string>) {
  switch (type) {
    case "public_license":
      return { public_license_class: data.license_class, public_license_expiry: data.expiry, public_license_no: secret.license_no };
    case "bank_book":
      return { bank_account: secret.account_no, bank_account_last4: secret.account_no?.slice(-4) };
    case "registration_book":
      return { registration_type: data.registration_type, owner_name: data.owner_name };
    case "compulsory_ins":
      return { compulsory_insurance_expiry: data.expiry };
    case "voluntary_ins":
      return {
        voluntary_insurer: data.insurer, voluntary_policy_no: data.policy_no, voluntary_insurance_usage: data.usage,
        voluntary_insurance_expiry: data.expiry, insurance_claim_phone: data.claim_phone,
      };
    case "passenger_ins":
      return { passenger_insurance_sum_satang: data.sum_baht, passenger_insurance_expiry: data.expiry };
    case "tax_receipt":
      return { tax_expiry: data.expiry };
    case "inspection":
      return { inspection_due: data.due };
    default:
      return {};
  }
}

/** FR-VEH-05: วันนี้ต้องเตือนกี่วันก่อนหมด (30/7/1) — null ถ้าไม่ใช่วันเตือน · วันที่เป็น YYYY-MM-DD ตามเวลาไทย */
export function reminderDue(expiresAt: string, today: string, days: number[]): number | null {
  const diff = Math.round((Date.parse(expiresAt) - Date.parse(today)) / 86_400_000);
  return days.includes(diff) ? diff : null;
}

export const REASON_TH: Record<string, string> = {
  kyc_not_approved: "เอกสารยังไม่ผ่านการอนุมัติ",
  registration_not_allowed: "ประเภทจดทะเบียนรับงานบริการนี้ไม่ได้",
  compulsory_ins_expired: "พ.ร.บ. หมดอายุ",
  insurance_usage_invalid: "ประกันภาคสมัครใจไม่ใช่ประเภทรับจ้าง/ให้เช่า/สาธารณะ",
  voluntary_ins_expired: "ประกันภาคสมัครใจหมดอายุ",
  passenger_ins_expired: "ประกันผู้โดยสารหมดอายุ",
  tax_expired: "ภาษีรถหมดอายุ",
  inspection_due: "เลยกำหนดตรวจสภาพ",
  inactive: "ปิดใช้งานรถ",
  license_expired: "ใบขับขี่หมดอายุ",
  license_class_mismatch: "ประเภทใบขับขี่ขับรถประเภทนี้ไม่ได้",
  background_check: "ผลตรวจประวัติไม่ผ่าน/หมดอายุ/ยังไม่ตั้งเกณฑ์",
  no_contract: "ยังไม่ยอมรับสัญญา",
  no_privacy_consent: "ยังไม่ยอมรับนโยบายความเป็นส่วนตัว",
  user_not_active: "บัญชีถูกระงับ",
};
