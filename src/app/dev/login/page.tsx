import { notFound } from "next/navigation";
import { pool } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev";
import { AppHeader, Panel } from "@/components/ui";
import { DevLoginButton } from "./button";

export const dynamic = "force-dynamic";

export default async function DevLogin({ searchParams }: PageProps<"/dev/login">) {
  if (!devLoginEnabled()) notFound();
  const next = String((await searchParams).next ?? "/liff/customer");
  const { rows } = await pool.query(
    `select id, role, display_name from users where role in ('customer','driver') and status = 'active' order by role, display_name`,
  );
  return (
    <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
      <AppHeader title="เข้าสู่ระบบแบบทดสอบ" subtitle="ใช้แทน LINE Login บนเครื่อง local เท่านั้น" />
      <main className="px-5 py-4">
        <Panel>
          <ul className="space-y-2">
            {rows.map((u) => (
              <li key={u.id}>
                <DevLoginButton userId={u.id} next={u.role === "driver" ? "/liff/driver" : next.startsWith("/") && !next.startsWith("//") ? next : "/"}>
                  <span className="font-medium">{u.display_name}</span>
                  <span className="text-sm text-muted">{u.role === "driver" ? "คนขับ" : "ลูกค้า"}</span>
                </DevLoginButton>
              </li>
            ))}
          </ul>
        </Panel>
      </main>
    </div>
  );
}
