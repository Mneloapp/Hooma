import { HomeStorefrontClient } from "@/components/home/HomeStorefrontClient";
import { getStorefrontCatalog } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const catalogProducts = await getStorefrontCatalog();
  return <HomeStorefrontClient catalogProducts={catalogProducts} />;
}
