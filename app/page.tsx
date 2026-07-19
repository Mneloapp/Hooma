import { HomeStorefrontClient } from "@/components/home/HomeStorefrontClient";
import { catalogCategories } from "@/data/catalog";
import { getDailyDealDiscountPercent } from "@/lib/daily-deals";
import { getStorefrontCatalog } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [catalogProducts, dailyDealDiscountPercent] = await Promise.all([
    getStorefrontCatalog(),
    getDailyDealDiscountPercent(),
  ]);
  const homeProducts = new Map(
    [...catalogProducts]
      .sort((left, right) => right.popularityScore - left.popularityScore || right.salesCount - left.salesCount || right.ratingAverage - left.ratingAverage)
      .slice(0, 12)
      .map((product) => [product.id, product]),
  );
  for (const category of catalogCategories) {
    catalogProducts
      .filter((product) => product.categorySlug === category.slug)
      .slice(0, 12)
      .forEach((product) => homeProducts.set(product.id, product));
  }

  return <HomeStorefrontClient catalogProducts={[...homeProducts.values()]} dailyDealDiscountPercent={dailyDealDiscountPercent} />;
}
