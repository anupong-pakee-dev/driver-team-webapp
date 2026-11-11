import type { CancelPolicy } from "@/domain/cancellation";
import { getI18n } from "@/lib/locale";
import { getSetting } from "@/lib/settings";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { AppHeader, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";

// FR-BOOK-03 / BR-CANCEL-02 · ฉบับใช้งาน 2026-11 (เจ้าของอนุมัติโดยไม่ผ่านทนาย) — ตารางยกเลิกดึงจาก settings (ตรงกับที่ระบบคำนวณจริง)
// ภาษาอังกฤษ/จีนเป็นคำแปล — ฉบับภาษาไทยมีผลบังคับ
export default async function CustomerTerms() {
  const { t } = await getI18n();
  const l = t.legal;
  const [terms, p] = await Promise.all([
    getSetting<{ terms_version: string; privacy_version: string }>("customer_terms"),
    getSetting<CancelPolicy>("cancellation_policy"),
  ]);
  const policy = p!;
  const mid = policy.mid_hours ?? 24;
  return (
    <div className="mx-auto w-full max-w-md lg:max-w-3xl lg:py-6">
      <AppHeader title={l.termsTitle} subtitle={l.version(terms?.terms_version ?? "")} right={<LanguageSwitcher />} />
      <main className="space-y-4 px-5 py-4 pb-10 text-sm">
        {l.draft && <div className="rounded-lg bg-warn/10 px-3 py-2 text-xs text-warn">{l.draft}</div>}
        {l.officialNote && <p className="text-xs text-muted">{l.officialNote}</p>}
        <Panel title={l.payTitle}>
          <ul className="list-disc space-y-1.5 pl-5">
            {l.pay.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Panel>
        <Panel title={l.cancelTitle}>
          <table className="w-full text-left">
            <thead className="text-muted">
              <tr><th className="py-1 font-medium">{l.caseCol}</th><th className="py-1 font-medium">{l.refundCol}</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              <tr><td className="py-1.5">{l.over(policy.full_refund_hours)}</td><td>100%</td></tr>
              <tr><td className="py-1.5">{l.between(mid, policy.full_refund_hours)}</td><td>{policy.mid.refundPct}%</td></tr>
              <tr><td className="py-1.5">{l.under(mid)}</td><td>0%</td></tr>
              <tr><td className="py-1.5">{l.noShow}</td><td>{l.noShowRefund}</td></tr>
              <tr><td className="py-1.5">{l.companyFault}</td><td>100%</td></tr>
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">{l.balanceNote}</p>
        </Panel>
        <Panel title={l.generalTitle}>
          <ul className="list-disc space-y-1.5 pl-5">
            {l.general.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Panel>
        <Panel title={l.privacyTitle(terms?.privacy_version ?? "")}>
          <div id="privacy" />
          <ul className="list-disc space-y-1.5 pl-5">
            {l.privacyShort.map((x) => <li key={x}>{x}</li>)}
          </ul>
        </Panel>
      </main>
    </div>
  );
}
