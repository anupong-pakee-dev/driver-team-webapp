import { loadCatalog } from "@/services/catalog";
import { Catalog } from "./catalog";

export const dynamic = "force-dynamic";

export default async function CatalogPage() {
  const { brand, tabs } = await loadCatalog("th");
  return <Catalog brandName={brand.name_th} tabs={tabs} />;
}
