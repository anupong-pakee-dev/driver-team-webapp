import { getSetting } from "@/lib/settings";
import { getI18n } from "@/lib/locale";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AppHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

// FR-PDPA-01 ประกาศความเป็นส่วนตัว (ลูกค้า/คนขับ แยก) มี version · ❓ เนื้อหาร่าง รอทนาย (T8)
// ภาษาอังกฤษ/จีนเป็นคำแปล — ฉบับภาษาไทยมีผลบังคับ
export default async function Privacy() {
  const { t } = await getI18n();
  const l = t.legal;
  const v = await getSetting<{ customer_version: string; driver_version: string }>("privacy_notice");
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-3xl lg:py-6">
      <AppHeader title={l.privacyPageTitle} subtitle={l.privacyPageSub} right={<LanguageSwitcher />} />
      <main className="space-y-4 px-5 py-4 pb-10 text-sm">
        <div className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{l.draft}</div>
        {l.officialNote && <p className="text-xs text-muted">{l.officialNote}</p>}
        <Panel title={l.forCustomers(v?.customer_version ?? "")}>
          <ul className="list-disc space-y-1.5 pl-5">
            {l.customer.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Panel>
        <Panel title={l.forDrivers(v?.driver_version ?? "")}>
          <ul className="list-disc space-y-1.5 pl-5">
            {l.driver.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Panel>
      </main>
    </div>
  );
}
