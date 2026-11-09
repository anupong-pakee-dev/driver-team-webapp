import "server-only";
import { redirect } from "next/navigation";
import { currentUser, type SessionUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { termsStatus } from "@/services/drivers";

/** หน้าคนขับ: คืน user หรือ null (ให้หน้าแสดง login) · ยังไม่ยอมรับสัญญา version ล่าสุด → ไปหน้า terms */
export async function driverPage(opts: { skipTerms?: boolean } = {}): Promise<{ user: SessionUser | null; notDriver: boolean }> {
  const user = await currentUser();
  if (!user) return { user: null, notDriver: false };
  if (user.role !== "driver") return { user: null, notDriver: true };
  if (!opts.skipTerms) {
    const { accepted } = await asUser(user.authUserId, (db) => termsStatus(db, user.id));
    if (!accepted) redirect("/liff/driver/terms");
  }
  return { user, notDriver: false };
}
