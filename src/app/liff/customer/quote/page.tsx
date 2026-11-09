import { randomUUID } from "node:crypto";
import { currentUser } from "@/lib/auth";
import { devLoginEnabled } from "@/lib/dev";
import { getSetting } from "@/lib/settings";
import { bangkokLocalInput } from "@/lib/time";
import { quoteFormOptions } from "@/services/quoteForm";
import { LiffLogin } from "@/components/LiffLogin";
import { QuoteForm } from "@/components/QuoteForm";
import { AppHeader, Panel } from "@/components/ui";
import { ClaimTouchpoint } from "./claim";

export const dynamic = "force-dynamic";

// FR-BOOK-01/02 ฟอร์มขอราคา (ลูกค้า) — ค่าเริ่มจากแคตตาล็อก ?service=&car=
export default async function QuoteRequestPage({ searchParams }: PageProps<"/liff/customer/quote">) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-md">
        <AppHeader title="ขอใบเสนอราคา" subtitle="เข้าสู่ระบบด้วย LINE เพื่อรับใบเสนอราคาในแชท" />
        <main className="px-5">
          <LiffLogin app="customer" liffId={process.env.NEXT_PUBLIC_LIFF_ID_CUSTOMER} devLogin={devLoginEnabled()} />
        </main>
      </div>
    );
  }
  const [options, lead] = await Promise.all([quoteFormOptions(true), getSetting<number>("quote_min_lead_minutes")]);
  return (
    <div className="mx-auto w-full max-w-md">
      <AppHeader title="ขอใบเสนอราคา" subtitle="รู้ราคาทันที ใบเสนอราคาส่งเข้า LINE" />
      <main className="px-5 py-4 pb-10">
        {typeof sp.t === "string" && /^[0-9a-f-]{36}$/.test(sp.t) && <ClaimTouchpoint touchpointId={sp.t} />}
        <Panel>
          <QuoteForm
            mode="customer"
            options={options}
            initialService={typeof sp.service === "string" ? sp.service : undefined}
            initialCar={typeof sp.car === "string" ? sp.car : undefined}
            idempotencyKey={randomUUID()}
            minPickup={bangkokLocalInput(Number(lead ?? 120))}
          />
        </Panel>
      </main>
    </div>
  );
}
