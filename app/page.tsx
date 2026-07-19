import { HomeStorefrontClient } from "@/components/home/HomeStorefrontClient";
import { catalogCategories } from "@/data/catalog";
import { getDailyDeals } from "@/lib/daily-deals";
import { getStorefrontCatalog } from "@/lib/storefront-catalog";
import { toProductCardData } from "@/lib/product-card";

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
  const dailyDealProducts = dailyDeals.deals.slice(0, 12).flatMap((deal) => {
    const product = catalogById.get(deal.productId);
    if (!product) return [];
    return [{
      ...toProductCardData(product),
      href: `/deals/${deal.slug}`,
      heroImage: deal.image || product.heroImage,
      price: deal.dealPrice ?? product.price,
      originalPrice: deal.originalPrice,
      discountPercent: deal.discountPercent,
    }];
  });

  return <HomeStorefrontClient
    catalogProducts={[...homeProducts.values()].map(toProductCardData)}
    dailyDealProducts={dailyDealProducts}
    dailyDealDiscountPercent={dailyDeals.discountPercent}
  />;
}
