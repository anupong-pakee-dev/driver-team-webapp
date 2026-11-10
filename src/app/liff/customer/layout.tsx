import { I18nProvider } from "@/components/I18nProvider";
import { PageViewBeacon } from "@/components/PageViewBeacon";
import { getLocale } from "@/lib/locale";

// หน้าลูกค้าใน LINE: 3 ภาษา (ไทย / English / 简体中文)
export default async function CustomerLayout({ children }: LayoutProps<"/liff/customer">) {
  return (
    <I18nProvider locale={await getLocale()}>
      {children}
      <PageViewBeacon />
    </I18nProvider>
  );
}
