import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { devLoginEnabled } from "@/lib/dev";
import { getSetting } from "@/lib/settings";
import { getI18n } from "@/lib/locale";
import { loadReceipt } from "@/services/receiptView";
import { LiffLogin } from "@/components/LiffLogin";
import { PrintButton } from "@/components/PrintButton";
import { ReceiptView } from "@/components/ReceiptView";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AppHeader, btnSecondary } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function CustomerReceipt({ params }: PageProps<"/liff/customer/receipts/[id]">) {
  const { t, locale } = await getI18n();
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
        <AppHeader title={t.receipt.loginTitle} subtitle={t.common.loginSubtitle} right={<LanguageSwitcher />} />
        <main className="px-5"><LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} /></main>
      </div>
    );
  }
  const r = await asUser(user.authUserId, async (db) => loadReceipt(db, (await params).id));
  if (!r) notFound();
  const company = (await getSetting<{ name_th: string; tax_id: string; address_th: string }>("company"))!;
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-2xl lg:py-6">
      <div className="print:hidden"><AppHeader title={t.receipt.title} right={<LanguageSwitcher />} /></div>
      <main className="space-y-4 px-5 py-4">
        <ReceiptView r={r} company={company} locale={locale} />
        <PrintButton className={`${btnSecondary} w-full print:hidden`} />
      </main>
    </div>
  );
}
