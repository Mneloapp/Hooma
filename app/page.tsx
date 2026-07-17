import { HomeStorefrontClient } from "@/components/home/HomeStorefrontClient";
import { getDailyDealDiscountPercent } from "@/lib/daily-deals";
import { getStorefrontCatalog } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [catalogProducts, dailyDealDiscountPercent] = await Promise.all([
    getStorefrontCatalog(),
    getDailyDealDiscountPercent(),
  ]);
  return <HomeStorefrontClient catalogProducts={catalogProducts} dailyDealDiscountPercent={dailyDealDiscountPercent} />;
}
