import Link from "next/link";
import { docType } from "@/domain/documents";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBangkok } from "@/lib/time";
import { Badge, Empty, Panel } from "@/components/ui";
import { ReviewButtons } from "../actions";

// FR-DRV-03: คิวเอกสารรอตรวจ + ใกล้หมดอายุ 30 วัน (เฉพาะ owner)
export default async function DocumentsQueue() {
  const user = await requireStaffPage(["owner"]);
  const { pending, expiring } = await asUser(user.authUserId, async (db) => {
    const owner = `case when d.owner_type = 'driver' then d.owner_id else v.driver_id end`;
    const base = `from documents d
                  left join vehicles v on d.owner_type = 'vehicle' and v.id = d.owner_id
                  join users u on u.id = ${owner}`;
    return {
      pending: (await db.query(
        `select d.id, d.doc_type, d.created_at, u.id as driver_id, u.display_name, v.plate ${base}
          where d.status = 'pending' order by d.created_at`,
      )).rows,
      expiring: (await db.query(
        `select d.id, d.doc_type, d.expires_at::text, u.id as driver_id, u.display_name, v.plate ${base}
          where d.status = 'approved' and d.expires_at <= current_date + 30
            and not exists (select 1 from documents n where n.owner_id = d.owner_id and n.doc_type = d.doc_type
                            and n.status = 'approved' and n.expires_at > d.expires_at)
          order by d.expires_at`,
      )).rows,
    };
  });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ตรวจเอกสาร</h1>
      <Panel title={`รอตรวจ (${pending.length})`}>
        {pending.length === 0 ? <Empty>ไม่มีเอกสารรอตรวจ</Empty> : (
          <ul className="divide-y divide-line">
            {pending.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <Link href={`/admin/drivers/${p.driver_id}`} className="font-medium text-navy hover:underline">{p.display_name}</Link>
                  <span className="text-muted"> · {docType(p.doc_type)?.label}{p.plate && ` · ${p.plate}`}</span>
                  <div className="text-xs text-muted">ส่งเมื่อ {formatBangkok(p.created_at)}</div>
                </div>
                <div className="flex items-center gap-3">
                  <a href={`/api/admin/documents/${p.id}/file`} target="_blank" rel="noreferrer" className="text-sm text-navy underline">เปิดไฟล์ ↗</a>
                  <Link href={`/admin/drivers/${p.driver_id}`} className="text-sm text-muted underline">ดูข้อมูลที่กรอก</Link>
                  <ReviewButtons docId={p.id} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>
      <Panel title={`หมดอายุใน 30 วัน (${expiring.length})`}>
        {expiring.length === 0 ? <Empty>ไม่มี</Empty> : (
          <ul className="divide-y divide-line text-sm">
            {expiring.map((e) => (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span>
                  <Link href={`/admin/drivers/${e.driver_id}`} className="text-navy hover:underline">{e.display_name}</Link>
                  {" · "}{docType(e.doc_type)?.label}{e.plate && ` · ${e.plate}`}
                </span>
                <Badge tone="warn">{e.expires_at}</Badge>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
