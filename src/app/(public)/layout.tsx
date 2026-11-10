import { CookieConsent } from "@/components/CookieConsent";
import { I18nProvider } from "@/components/I18nProvider";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { getLocale } from "@/lib/locale";

// หน้าสาธารณะ (แคตตาล็อก, landing, privacy): แบนเนอร์คุกกี้ (FR-PDPA-05) · 3 ภาษา
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider locale={await getLocale()}>
      {children}
      <CookieConsent pixelId={process.env.NEXT_PUBLIC_META_PIXEL_ID} />
      <PageViewBeacon />
    </I18nProvider>
  );
}
