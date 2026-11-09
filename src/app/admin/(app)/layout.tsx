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
      <aside className="bg-navy text-white md:w-60 md:shrink-0">
        <div className="flex items-center justify-between px-5 py-4 md:block">
          <div>
            <div className="text-lg font-bold">หลังบ้าน</div>
            <div className="text-xs text-amber-soft">
              {user.displayName} · {user.role === "owner" ? "เจ้าของ" : "แอดมินขาย"}
            </div>
          </div>
          <LogoutButton to="/admin/login" className="rounded-lg border border-white/30 px-3 py-1.5 text-sm md:mt-3" />
        </div>
        <AdminNav />
      </aside>
      <main className="min-w-0 flex-1 p-4 md:p-8">{children}</main>
    </div>
  );
}
