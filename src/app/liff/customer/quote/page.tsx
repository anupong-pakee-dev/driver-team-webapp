import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { devLoginEnabled } from "@/lib/dev";
import { getI18n } from "@/lib/locale";
import { getSetting } from "@/lib/settings";
import { bangkokLocalInput } from "@/lib/time";
import { quoteFormOptions } from "@/services/quoteForm";
import { LiffLogin } from "@/components/LiffLogin";
import { QuoteForm } from "@/components/QuoteForm";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AppHeader } from "@/components/ui";
import { ClaimTouchpoint } from "./claim";

export const dynamic = "force-dynamic";

// FR-BOOK-01/02 ฟอร์มขอราคา (ลูกค้า) — ค่าเริ่มจากแคตตาล็อก ?service=&car=
export default async function QuoteRequestPage({ searchParams }: PageProps<"/liff/customer/quote">) {
  const sp = await searchParams;
  const { t, locale } = await getI18n();
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md lg:my-16 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:pb-6 lg:shadow-[0_12px_40px_rgba(0,0,0,.06)]">
        <AppHeader title={t.quoteForm.title} subtitle={t.quoteForm.loginSubtitle} right={<LanguageSwitcher />} />
        <main className="px-5">
          <LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} />
        </main>
      </div>
    );
  }
  const [options, lead] = await Promise.all([quoteFormOptions(true, locale), getSetting<number>("quote_min_lead_minutes")]);
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-2xl lg:py-6">
      <AppHeader title={t.quoteForm.title} subtitle={t.quoteForm.subtitle} right={<LanguageSwitcher />} back="/" backLabel={t.common.back} />
      <main className="px-5 py-4 pb-32 lg:mx-5 lg:mt-2 lg:rounded-[var(--radius-card)] lg:border lg:border-line lg:bg-card lg:p-7">
        {typeof sp.t === "string" && /^[0-9a-f-]{36}$/.test(sp.t) && <ClaimTouchpoint touchpointId={sp.t} />}
        <QuoteForm
            mode="customer"
            options={options}
            initialService={typeof sp.service === "string" ? sp.service : undefined}
            initialCar={typeof sp.car === "string" ? sp.car : undefined}
            idempotencyKey={randomUUID()}
            minPickup={bangkokLocalInput(Number(lead ?? 120))}
          />
      </main>
    </div>
  );
}
