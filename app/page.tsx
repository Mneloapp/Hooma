import type { Metadata } from "next";
import { JsonLd } from "@/components/JsonLd";
import { HomeStorefrontClient } from "@/components/home/HomeStorefrontClient";
import { getDailyDeals } from "@/lib/daily-deals";
import { applyProductCardDeal } from "@/lib/product-card";
import type { ProductCardData } from "@/lib/product-card";
import { getStorefrontHomeCards, getStorefrontProductCardsByIds } from "@/lib/storefront-catalog";
import { absoluteUrl, DEFAULT_DESCRIPTION, DEFAULT_SOCIAL_IMAGE, SITE_NAME } from "@/lib/seo";

export const dynamic = "force-dynamic";

const HOME_CATEGORY_PRODUCTS = 6;
const HOME_DAILY_DEALS = 6;

export const metadata: Metadata = {
  title: { absolute: "Hooma — პრაქტიკული ნივთები ყოველდღიურობისთვის" },
  description: DEFAULT_DESCRIPTION,
  alternates: { canonical: absoluteUrl("/") },
  openGraph: {
    type: "website",
    locale: "ka_GE",
    url: absoluteUrl("/"),
    siteName: SITE_NAME,
    title: "Hooma — პრაქტიკული ნივთები ყოველდღიურობისთვის",
    description: DEFAULT_DESCRIPTION,
    images: [{ url: DEFAULT_SOCIAL_IMAGE, alt: "Hooma", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Hooma — პრაქტიკული ნივთები ყოველდღიურობისთვის",
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_SOCIAL_IMAGE],
  },
};

export default async function Home() {
  const [homeCards, dailyDeals] = await Promise.all([
    getStorefrontHomeCards(HOME_CATEGORY_PRODUCTS),
    getDailyDeals(),
  ]);
  const dailyDealByProductId = new Map(dailyDeals.deals.map((deal) => [deal.productId, deal]));
  const dailyDealCards = await getStorefrontProductCardsByIds(dailyDeals.deals.slice(0, HOME_DAILY_DEALS).map((deal) => deal.productId));
  const dailyDealProducts = dailyDealCards.map((product) => applyProductCardDeal(product, dailyDealByProductId.get(product.id)));
  const applyDeals = (products: ProductCardData[]) => products.map((product) => applyProductCardDeal(product, dailyDealByProductId.get(product.id)));
  const categoryProducts = Object.fromEntries(
    Object.entries(homeCards.categoryProducts).map(([slug, products]) => [slug, applyDeals(products)]),
  );

  const storeJsonLd = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": absoluteUrl("/#store"),
    name: SITE_NAME,
    url: absoluteUrl("/"),
    description: DEFAULT_DESCRIPTION,
    logo: {
      "@type": "ImageObject",
      url: absoluteUrl("/brand/hooma-logo.png"),
      width: 552,
      height: 462,
    },
    image: absoluteUrl(DEFAULT_SOCIAL_IMAGE),
    address: {
      "@type": "PostalAddress",
      addressLocality: "თბილისი",
      addressCountry: "GE",
    },
  };

  return <>
    <JsonLd data={storeJsonLd} />
    <HomeStorefrontClient
      categoryProducts={categoryProducts}
      dailyDealProducts={dailyDealProducts}
      dailyDealDiscountPercent={dailyDeals.discountPercent}
    />
  </>;
}
