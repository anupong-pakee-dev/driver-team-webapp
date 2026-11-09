import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBangkok } from "@/lib/time";
import { Badge, Empty, Panel } from "@/components/ui";

// FR-AUDIT-01 · append-only
export default async function AuditPage() {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const rows = await asUser(user.authUserId, async (db) =>
    (await db.query(
      `select a.id, a.at, a.action, a.entity, a.entity_id, a.reason, a.actor_role, u.display_name as actor,
              a.before, a.after
         from audit_logs a left join users u on u.id = a.actor_id
        order by a.id desc limit 100`,
    )).rows);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">บันทึกการแก้ไข</h1>
        <p className="text-sm text-muted">100 รายการล่าสุด · แก้หรือลบไม่ได้</p>
      </div>
      <Panel>
        {rows.length === 0 ? (
          <Empty>ยังไม่มีบันทึก</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {rows.map((r) => (
              <li key={r.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <Badge tone={r.action === "DELETE" ? "bad" : r.action === "INSERT" ? "ok" : "info"}>{r.action}</Badge>
                  <span className="font-medium">{r.entity}</span>
                  <span className="font-mono text-xs text-muted">{r.entity_id}</span>
                  <span className="ml-auto text-xs text-muted">{formatBangkok(r.at)}</span>
                </div>
                <div className="mt-1 text-sm text-muted">
                  โดย {r.actor ?? r.actor_role ?? "ระบบ"}
                  {r.reason && <> · เหตุผล: {r.reason}</>}
                </div>
                {r.action === "UPDATE" && r.entity === "settings" && (
                  <div className="mt-1 font-mono text-xs">
                    {JSON.stringify(r.before?.value)} → {JSON.stringify(r.after?.value)}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
