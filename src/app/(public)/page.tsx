import { localized } from "@/i18n";
import { getLocale } from "@/lib/locale";
import { loadCatalog } from "@/services/catalog";
import { Catalog } from "./catalog";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const locale = await getLocale();
  const { brand, tabs } = await loadCatalog(locale);
  return <Catalog brandName={localized(brand, "name", locale)} tabs={tabs} />;
}
