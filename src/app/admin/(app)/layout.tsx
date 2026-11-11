import { redirect } from "next/navigation";
import { STAFF, currentUser } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";
import { AdminNav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await currentUser();
  if (!user || !STAFF.includes(user.role)) redirect("/admin/login");

  return (
    <div className="flex min-h-screen flex-1 flex-col md:flex-row">
      <aside className="border-b border-line md:w-[232px] md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center justify-between px-5 py-4 md:block md:px-6 md:pt-5">
          <div>
            <div className="text-base font-bold">Avera · หลังบ้าน</div>
            <div className="text-xs text-muted">
              {user.displayName} · {user.role === "owner" ? "เจ้าของ" : "แอดมินขาย"}
            </div>
          </div>
          <LogoutButton to="/admin/login" className="rounded-full bg-chip px-3 py-1.5 text-sm font-medium md:mt-3" />
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
