import type { MetadataRoute } from "next";
import { catalogCategories } from "@/data/catalog";
import { absoluteUrl, categoryPath } from "@/lib/seo";
import { getStorefrontSitemapCatalog } from "@/lib/storefront-catalog";

export const dynamic = "force-dynamic";

const informationPages = [
  "/about",
  "/contact",
  "/faq",
  "/hooma-plus",
  "/how-it-works",
  "/privacy",
  "/terms",
] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { products, activeCategorySlugs } = await getStorefrontSitemapCatalog();
  const activeCategorySet = new Set(activeCategorySlugs);
  const productCategorySlugs = new Set(products.map((product) => product.categorySlug));
  const publicCategories = catalogCategories.filter((category) => (
    activeCategorySet.has(category.slug) && productCategorySlugs.has(category.slug)
  ));

  return [
    { url: absoluteUrl("/"), changeFrequency: "daily", priority: 1 },
    { url: absoluteUrl("/shop"), changeFrequency: "daily", priority: 0.9 },
    { url: absoluteUrl("/deals"), changeFrequency: "daily", priority: 0.7 },
    ...publicCategories.map((category) => ({
      url: absoluteUrl(categoryPath(category.slug)),
      changeFrequency: "daily" as const,
      priority: 0.8,
    })),
    ...products.map((product) => ({
      url: absoluteUrl(`/product/${encodeURIComponent(product.slug)}`),
      lastModified: product.refreshedAt,
      changeFrequency: "weekly" as const,
      priority: 0.7,
      images: product.image ? [absoluteUrl(product.image)] : undefined,
    })),
    ...informationPages.map((path) => ({
      url: absoluteUrl(path),
      changeFrequency: "monthly" as const,
      priority: 0.5,
    })),
  ];
}
