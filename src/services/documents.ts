import "server-only";
import { randomUUID } from "node:crypto";
import { ALLOWED_UPLOAD, MAX_UPLOAD_BYTES, upload } from "@/adapters/storage";
import { DocDataError, approvalPatch, docType, parseDocData, type OwnerType } from "@/domain/documents";
import type { SessionUser } from "@/lib/auth";
import { decryptField, encryptField } from "@/lib/crypto";
import { withTx, type Db } from "@/lib/db";
import { BizError } from "@/lib/errors";
import { getSetting } from "@/lib/settings";
import { enqueue } from "./outbox";

// FR-DRV-02/03, FR-VEH-01..03

type Option = { code: string; label_th: string };

export async function allowedOptions(db?: Db) {
  const [reg, lic] = await Promise.all([
    getSetting<Option[]>("registration_types", db),
    getSetting<Option[]>("license_classes", db),
  ]);
  return {
    registration_types: (reg ?? []).map((o) => o.code),
    license_classes: (lic ?? []).map((o) => o.code),
  };
}

/** คนขับเป็นเจ้าของ owner_id นี้ไหม */
async function assertOwns(db: Db, user: SessionUser, ownerType: OwnerType, ownerId: string) {
  if (ownerType === "driver") {
    if (ownerId !== user.id) throw new BizError("FORBIDDEN");
    return;
  }
  const { rows } = await db.query(`select 1 from vehicles where id = $1 and driver_id = $2`, [ownerId, user.id]);
  if (!rows[0]) throw new BizError("FORBIDDEN");
}

export async function submitDocument(
  user: SessionUser,
  input: { ownerType: OwnerType; ownerId: string; docType: string; file: File; fields: Record<string, unknown> },
) {
  const def = docType(input.docType);
  if (!def || def.owner !== input.ownerType) throw new BizError("VALIDATION", { doc_type: "unknown" });
  const ext = ALLOWED_UPLOAD[input.file.type as keyof typeof ALLOWED_UPLOAD];
  if (!ext) throw new BizError("VALIDATION", { file: "type" });
  if (input.file.size > MAX_UPLOAD_BYTES) throw new BizError("VALIDATION", { file: "size" });

  let parsed;
  try {
    parsed = parseDocData(def, input.fields, await allowedOptions());
  } catch (e) {
    if (e instanceof DocDataError) throw new BizError("VALIDATION", { field: e.field, problem: e.problem });
    throw e;
  }

  const folder = input.ownerType === "driver" ? "drivers" : "vehicles";
  const path = `${folder}/${input.ownerId}/${def.type}-${randomUUID()}.${ext}`;

  return withTx({ userId: user.id, role: user.role, reason: `upload ${def.type}` }, async (db) => {
    await assertOwns(db, user, input.ownerType, input.ownerId);
    await upload("kyc-docs", path, await input.file.arrayBuffer(), input.file.type);
    const secret = Object.keys(parsed.secret).length ? encryptField(JSON.stringify(parsed.secret)) : null;
    const { rows } = await db.query(
      `insert into documents (owner_type, owner_id, doc_type, file_path, expires_at, data, data_enc, uploaded_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, status`,
      [input.ownerType, input.ownerId, def.type, path, parsed.expiresAt, parsed.data, secret, user.id],
    );
    await db.query(`select refresh_kyc($1, $2)`, [input.ownerType, input.ownerId]);
    return rows[0] as { id: string; status: string };
  });
}

const DRIVER_COLS = new Set(["public_license_class", "public_license_expiry", "bank_account_last4"]);
const VEHICLE_COLS = new Set([
  "registration_type", "owner_name", "compulsory_insurance_expiry", "voluntary_insurer", "voluntary_policy_no",
  "voluntary_insurance_usage", "voluntary_insurance_expiry", "insurance_claim_phone",
  "passenger_insurance_sum_satang", "passenger_insurance_expiry", "tax_expiry", "inspection_due",
]);

/** FR-DRV-03: owner อนุมัติ/ปฏิเสธทีละรายการ → คัดลอกข้อมูลเข้า drivers/vehicles → คำนวณ kyc ใหม่ทันที */
export async function reviewDocument(owner: SessionUser, docId: string, approve: boolean, reason: string | null) {
  if (!approve && !reason) throw new BizError("VALIDATION", { reason: "required" });
  return withTx({ userId: owner.id, role: owner.role, reason: reason ?? "approve document" }, async (db) => {
    const { rows } = await db.query(
      `select id, owner_type, owner_id, doc_type, status, data, data_enc from documents where id = $1 for update`,
      [docId],
    );
    const doc = rows[0];
    if (!doc) throw new BizError("NOT_FOUND");
    if (doc.status !== "pending") throw new BizError("INVALID_TRANSITION");

    await db.query(
      `update documents set status = $2, reviewed_by = $3, reviewed_at = now(), reject_reason = $4 where id = $1`,
      [docId, approve ? "approved" : "rejected", owner.id, approve ? null : reason],
    );

    if (approve) {
      const secret = doc.data_enc ? (JSON.parse(decryptField(doc.data_enc)) as Record<string, string>) : {};
      const patch: Record<string, unknown> = approvalPatch(doc.doc_type, doc.data, secret);
      const set: Record<string, unknown> = {};
      const allowed = doc.owner_type === "driver" ? DRIVER_COLS : VEHICLE_COLS;
      for (const [k, v] of Object.entries(patch)) if (allowed.has(k) && v !== undefined) set[k] = v;
      if (doc.owner_type === "driver") {
        if (patch.public_license_no) set.public_license_no_enc = encryptField(String(patch.public_license_no));
        if (patch.bank_account) set.bank_account_enc = encryptField(String(patch.bank_account));
      }
      const keys = Object.keys(set);
      if (keys.length) {
        const table = doc.owner_type === "driver" ? "drivers" : "vehicles";
        const idCol = doc.owner_type === "driver" ? "user_id" : "id";
        await db.query(
          `update ${table} set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where ${idCol} = $1`,
          [doc.owner_id, ...keys.map((k) => set[k])],
        );
      }
    }
    const { rows: k } = await db.query(`select refresh_kyc($1, $2) as kyc`, [doc.owner_type, doc.owner_id]);

    // แจ้งคนขับผลการตรวจ
    const { rows: who } = await db.query(
      doc.owner_type === "driver"
        ? `select line_user_id from users where id = $1`
        : `select u.line_user_id from vehicles v join users u on u.id = v.driver_id where v.id = $1`,
      [doc.owner_id],
    );
    if (who[0]?.line_user_id) {
      const label = docType(doc.doc_type)?.label ?? doc.doc_type;
      await enqueue(db, "line.push", {
        to: who[0].line_user_id,
        messages: [{ type: "text", text: approve ? `เอกสาร "${label}" ผ่านการตรวจแล้ว` : `เอกสาร "${label}" ไม่ผ่าน: ${reason}\nกรุณาส่งใหม่ในแอป` }],
      }, `doc-review:${docId}`);
    }
    return { status: approve ? "approved" : "rejected", kyc_status: k[0].kyc };
  });
}
