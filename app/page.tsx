import { HomeStorefrontClient } from "@/components/home/HomeStorefrontClient";
import { getDailyDeals } from "@/lib/daily-deals";
import { applyProductCardDeal } from "@/lib/product-card";
import { getStorefrontHomeCards, getStorefrontProductCardsByIds } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

export default async function Home() {
  const [homeCards, dailyDeals] = await Promise.all([
    getStorefrontHomeCards(12),
    getDailyDeals(),
  ]);
  const dailyDealByProductId = new Map(dailyDeals.deals.map((deal) => [deal.productId, deal]));
  const dailyDealCards = await getStorefrontProductCardsByIds(dailyDeals.deals.slice(0, 12).map((deal) => deal.productId));
  const dailyDealProducts = dailyDealCards.map((product) => applyProductCardDeal(product, dailyDealByProductId.get(product.id)));
  const applyDeals = (products: typeof homeCards.popularProducts) => products.map((product) => applyProductCardDeal(product, dailyDealByProductId.get(product.id)));
  const categoryProducts = Object.fromEntries(
    Object.entries(homeCards.categoryProducts).map(([slug, products]) => [slug, applyDeals(products)]),
  );

  return <HomeStorefrontClient
    popularProducts={applyDeals(homeCards.popularProducts)}
    categoryProducts={categoryProducts}
    dailyDealProducts={dailyDealProducts}
    dailyDealDiscountPercent={dailyDeals.discountPercent}
  />;
}
