import "server-only";

import { revalidateTag } from "next/cache";

export const STOREFRONT_CATALOG_CACHE_TAG = "storefront-catalog";
export const STOREFRONT_HOME_CACHE_TAG = "storefront-home";
export const STOREFRONT_PRODUCTS_CACHE_TAG = "storefront-products";
export const STOREFRONT_CATEGORIES_CACHE_TAG = "storefront-categories";
export const STOREFRONT_SITEMAP_CACHE_TAG = "storefront-sitemap";

export const STOREFRONT_DISPLAY_CACHE_SECONDS = 300;
export const STOREFRONT_SITEMAP_CACHE_SECONDS = 900;

function scopedTag(scope: "product" | "category", value: string) {
  const safeValue = value.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 160);
  return `storefront-${scope}:${safeValue || "unknown"}`;
}

export function storefrontProductCacheTag(slugOrId: string) {
  return scopedTag("product", slugOrId);
}

export function storefrontCategoryCacheTag(slug: string) {
  return scopedTag("category", slug);
}

export function revalidateStorefrontCatalog({
  productSlugsOrIds = [],
  categorySlugs = [],
}: {
  productSlugsOrIds?: string[];
  categorySlugs?: string[];
} = {}) {
  const tags = new Set([
    STOREFRONT_CATALOG_CACHE_TAG,
    STOREFRONT_HOME_CACHE_TAG,
    STOREFRONT_PRODUCTS_CACHE_TAG,
    STOREFRONT_CATEGORIES_CACHE_TAG,
    STOREFRONT_SITEMAP_CACHE_TAG,
    ...productSlugsOrIds.map(storefrontProductCacheTag),
    ...categorySlugs.map(storefrontCategoryCacheTag),
  ]);
  for (const tag of tags) revalidateTag(tag);
}
