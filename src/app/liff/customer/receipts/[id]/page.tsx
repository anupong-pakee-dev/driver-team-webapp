import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev";
import { getSetting } from "@/lib/settings";
import { loadReceipt } from "@/services/receiptView";
import { LiffLogin } from "@/components/LiffLogin";
import { PrintButton } from "@/components/PrintButton";
import { ReceiptView } from "@/components/ReceiptView";
import { AppHeader, btnSecondary } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomerReceipt({ params }: PageProps<"/liff/customer/receipts/[id]">) {
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md">
        <AppHeader title="ใบเสร็จ" subtitle="เข้าสู่ระบบด้วย LINE" />
        <main className="px-5"><LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} /></main>
      </div>
    );
  }
  const r = await asUser(user.authUserId, async (db) => loadReceipt(db, (await params).id));
  if (!r) notFound();
  const company = (await getSetting<{ name_th: string; tax_id: string; address_th: string }>("company"))!;
  return (
    <div className="mx-auto w-full max-w-md">
      <div className="print:hidden"><AppHeader title="ใบเสร็จรับเงิน" /></div>
      <main className="space-y-4 px-5 py-4">
        <ReceiptView r={r} company={company} />
        <PrintButton className={`${btnSecondary} w-full print:hidden`} />
      </main>
    </div>
  );
}
