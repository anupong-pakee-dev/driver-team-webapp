import Link from "next/link";
import { requireStaffPage } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { formatBangkok } from "@/lib/time";
import { Badge, Panel } from "@/components/ui";
import { RevokeStaffInvite, StaffInviteForm } from "./staff";
import { UserStatus } from "./status";

const ROLE_TH: Record<string, string> = { customer: "ลูกค้า", corporate_customer: "ลูกค้าองค์กร", driver: "คนขับ", sales_admin: "แอดมินขาย", owner: "เจ้าของ", partner: "พาร์ทเนอร์" };
const STATUS_TONE = { active: "ok", suspended: "warn", blocked: "bad" } as const;

// FR-ADMIN-03 บล็อก/ระงับผู้ใช้ (owner) — ไม่แสดงเบอร์/ชื่อเต็ม
export default async function UsersPage({ searchParams }: PageProps<"/admin/users">) {
  const user = await requireStaffPage(["sales_admin", "owner"]);
  const role = String((await searchParams).role ?? "all");
  const rows = await asUser(user.authUserId, async (db) => (await db.query(
    `select u.id, u.role, u.status, u.display_name, u.created_at, coalesce(line_linked(u.id), false) as linked,
            (select count(*) from bookings b where b.customer_id = u.id or b.driver_id = u.id)::int as jobs
       from users u where ($1 = 'all' or u.role::text = $1) order by u.created_at desc limit 300`, [role])).rows);
  // RLS: เฉพาะ owner อ่าน staff_invites ได้
  const invites = user.role === "owner"
    ? await asUser(user.authUserId, async (db) => (await db.query(
        `select id, email, role, display_name, expires_at from staff_invites
          where used_at is null and expires_at > now() order by created_at desc`)).rows)
    : [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">ผู้ใช้</h1>
      {user.role === "owner" && (
        <Panel title="เพิ่มแอดมิน">
          <div className="space-y-3">
            <StaffInviteForm />
            {invites.length > 0 && (
              <ul className="divide-y divide-line text-sm">
                {invites.map((i) => (
                  <li key={i.id} className="flex flex-wrap items-center gap-3 py-2">
                    <div className="min-w-48 flex-1">
                      <div className="font-medium">{i.display_name} · <span className="font-normal text-muted">{i.email}</span></div>
                      <div className="text-xs text-muted">{ROLE_TH[i.role]} · รอตั้งรหัสผ่าน · หมดอายุ {formatBangkok(i.expires_at)}</div>
                    </div>
                    <RevokeStaffInvite id={i.id} />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      )}
      <nav className="flex flex-wrap gap-2 text-sm">
        {["all", "customer", "driver", "sales_admin", "owner"].map((r) => (
          <Link key={r} href={`/admin/users?role=${r}`} className={"rounded-full px-3 py-1.5 " + (role === r ? "bg-navy text-white" : "border border-line bg-card")}>
            {r === "all" ? "ทั้งหมด" : ROLE_TH[r]}
          </Link>
        ))}
      </nav>
      <Panel>
        <ul className="divide-y divide-line text-sm">
          {rows.map((u) => (
            <li key={u.id} className="flex flex-wrap items-center gap-3 py-2.5">
              <div className="min-w-48 flex-1">
                <div className="font-medium">{u.display_name ?? "(ไม่มีชื่อ)"}</div>
                <div className="text-xs text-muted">{ROLE_TH[u.role]} · {u.linked ? "LINE" : "ไม่มี LINE"} · {u.jobs} งาน · สมัคร {formatBangkok(u.created_at)}</div>
              </div>
              <Badge tone={STATUS_TONE[u.status as keyof typeof STATUS_TONE]}>{u.status}</Badge>
              {user.role === "owner" && u.role !== "owner" && <UserStatus userId={u.id} status={u.status} />}
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
