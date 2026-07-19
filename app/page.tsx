import { HomeStorefrontClient } from "@/components/home/HomeStorefrontClient";
import { catalogCategories } from "@/data/catalog";
import { getDailyDeals } from "@/lib/daily-deals";
import { getStorefrontCatalog } from "@/lib/storefront-catalog";
import { toDiscountedProductCardData } from "@/lib/product-card";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [catalogProducts, dailyDeals] = await Promise.all([
    getStorefrontCatalog(),
    getDailyDeals(),
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

  const catalogById = new Map(catalogProducts.map((product) => [product.id, product]));
  const dailyDealByProductId = new Map(dailyDeals.deals.map((deal) => [deal.productId, deal]));
  const dailyDealProducts = dailyDeals.deals.slice(0, 12).flatMap((deal) => {
    const product = catalogById.get(deal.productId);
    if (!product) return [];
    return [toDiscountedProductCardData(product, deal)];
  });

  return <HomeStorefrontClient
    catalogProducts={[...homeProducts.values()].map((product) => toDiscountedProductCardData(product, dailyDealByProductId.get(product.id)))}
    dailyDealProducts={dailyDealProducts}
    dailyDealDiscountPercent={dailyDeals.discountPercent}
  />;
}
