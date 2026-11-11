import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { asUser, pool } from "@/lib/db";
import { decryptField } from "@/lib/crypto";
import { devLoginEnabled } from "@/lib/dev";
import { localized } from "@/i18n";
import { getI18n } from "@/lib/locale";
import { getSetting, type Brand } from "@/lib/settings";
import { loadQuote } from "@/services/quoteView";
import { LiffLogin } from "@/components/LiffLogin";
import { PrintButton } from "@/components/PrintButton";
import { QuoteView } from "@/components/QuoteView";
import { AcceptQuote } from "./accept";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AppHeader, btnPrimary, btnSecondary } from "@/components/ui";

export const dynamic = "force-dynamic";

// FR-QUOTE-01 ลิงก์ใบเสนอราคา (เปิดจาก Flex Message) — RLS: เห็นเฉพาะของตัวเอง
export default async function CustomerQuote({ params }: PageProps<"/liff/customer/quotes/[id]">) {
  const { t, locale } = await getI18n();
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
        <AppHeader title={t.quote.title} subtitle={t.common.loginSubtitle} right={<LanguageSwitcher />} />
        <main className="px-5">
          <LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} />
        </main>
      </div>
    );
  }
  const { id } = await params;
  const q = await asUser(user.authUserId, (db) => loadQuote(db, id));
  if (!q) notFound();
  const brand = localized(await getSetting<Brand>("brand"), "name", locale);
  const active = q.status === "sent" && new Date(q.expires_at) > new Date();
  const terms = (await getSetting<{ terms_version: string; privacy_version: string }>("customer_terms"))!;
  const booking = await asUser(user.authUserId, async (db) =>
    (await db.query(`select id from bookings where quote_id = $1`, [q.id])).rows[0]?.id as string | undefined);
  // ค่าเริ่มของฟอร์ม: ข้อมูลของลูกค้าเอง (ถอดรหัสฝั่งเซิร์ฟเวอร์)
  const { rows: me } = await pool.query(`select full_name_enc, phone_enc from users where id = $1`, [user.id]);
  const defaults = {
    full_name: me[0]?.full_name_enc ? decryptField(me[0].full_name_enc) : "",
    phone: me[0]?.phone_enc ? decryptField(me[0].phone_enc).replace(/^\+66/, "0") : "",
  };

  return (
    <div className="mx-auto w-full max-w-md lg:max-w-5xl lg:py-6">
      <div className="print:hidden"><AppHeader title={t.quote.title} subtitle={t.quote.subtitle} right={<LanguageSwitcher />} back="/liff/customer" backLabel={t.common.back} /></div>
      {/* จอคอม (lg): ใบเสนอราคาด้านซ้าย · ปุ่มยืนยัน/พิมพ์ด้านขวาติดอยู่ขณะเลื่อน */}
      <main className="space-y-4 px-5 py-4 pb-10 lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-x-6 lg:space-y-0 print:block">
        {q.status === "superseded" && q.latest_id !== q.id && (
          <Link href={`/liff/customer/quotes/${q.latest_id}`} className="block rounded-xl bg-warn/10 px-4 py-3 text-sm text-warn lg:col-span-2 lg:mb-4 print:hidden">
            {t.quote.newer}
          </Link>
        )}
        <QuoteView q={q} brand={brand} locale={locale} />
        <div className="space-y-2 lg:sticky lg:top-6 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:p-4 print:hidden">
          {booking ? (
            <Link href={`/liff/customer/bookings/${booking}`} className={`${btnPrimary} w-full`}>{t.quote.goBooking}</Link>
          ) : active ? (
            <AcceptQuote quoteId={q.id} terms={terms} driverOnly={q.car_type === "driver_only"}
              idempotencyKey={randomUUID()} defaults={defaults} />
          ) : (
            <button className={`${btnPrimary} w-full`} disabled>{t.quote.cannotAccept}</button>
          )}
          <div className="flex gap-2">
            <PrintButton className={`${btnSecondary} flex-1`} />
            <Link href="/liff/customer/quote" className={`${btnSecondary} flex-1`}>{t.quote.requestNew}</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
