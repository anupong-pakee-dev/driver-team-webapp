import "server-only";
import { docType, reminderDue } from "@/domain/documents";
import { SYSTEM, withTx } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { TZ } from "@/lib/time";
import { enqueue } from "./outbox";

// §10 doc_expiry (ทุกวัน 08:00) · FR-VEH-05 เตือน 30/7/1 วัน (คนขับ + owner) · หมดแล้ว → expired

export const bangkokToday = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);

export async function runDocExpiry(today = bangkokToday()) {
  const days = (await getSetting<{ doc_reminder_days?: number[] }>("compliance"))?.doc_reminder_days ?? [30, 7, 1];

  return withTx({ ...SYSTEM, reason: "doc_expiry job" }, async (db) => {
    // หมดอายุแล้ว
    const { rows: expired } = await db.query(
      `update documents set status = 'expired'
        where status = 'approved' and expires_at < $1::date
        returning owner_type, owner_id`,
      [today],
    );
    for (const o of new Map(expired.map((r) => [`${r.owner_type}:${r.owner_id}`, r])).values()) {
      await db.query(`select refresh_kyc($1, $2)`, [o.owner_type, o.owner_id]);
    }

    // ใกล้หมด: เฉพาะฉบับ approved ล่าสุดของแต่ละประเภท (ถ้าต่ออายุแล้วจะไม่เตือนฉบับเก่า)
    const { rows: docs } = await db.query(
      `select distinct on (d.owner_type, d.owner_id, d.doc_type)
              d.id, d.doc_type, d.expires_at::text as expires_at, d.owner_type,
              coalesce(du.line_user_id, vu.line_user_id) as line_user_id,
              coalesce(du.display_name, vu.display_name) as driver_name, v.plate
         from documents d
         left join users du on d.owner_type = 'driver' and du.id = d.owner_id
         left join vehicles v on d.owner_type = 'vehicle' and v.id = d.owner_id
         left join users vu on vu.id = v.driver_id
        where d.status = 'approved' and d.expires_at is not null
        order by d.owner_type, d.owner_id, d.doc_type, d.expires_at desc`,
    );
    const { rows: owners } = await db.query(
      `select line_user_id from users where role = 'owner' and status = 'active' and line_user_id is not null`,
    );

    let reminders = 0;
    for (const d of docs) {
      const left = reminderDue(d.expires_at, today, days);
      if (left === null) continue;
      reminders++;
      const label = docType(d.doc_type)?.label ?? d.doc_type;
      const what = d.plate ? `${label} รถ ${d.plate}` : label;
      if (d.line_user_id) {
        await enqueue(db, "line.push", {
          to: d.line_user_id,
          messages: [{ type: "text", text: `${what} จะหมดอายุในอีก ${left} วัน (${d.expires_at}) กรุณาส่งฉบับใหม่ในแอป` }],
        }, `doc-expiry:${d.id}:${left}:driver`);
      }
      for (const o of owners) {
        await enqueue(db, "line.push", {
          to: o.line_user_id,
          messages: [{ type: "text", text: `[เอกสารใกล้หมด] ${d.driver_name}: ${what} อีก ${left} วัน` }],
        }, `doc-expiry:${d.id}:${left}:owner:${o.line_user_id}`);
      }
    }
    return { today, expired: expired.length, reminders };
  });
}
