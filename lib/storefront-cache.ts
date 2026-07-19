import "server-only";

import { revalidateTag } from "next/cache";

export const STOREFRONT_CATALOG_CACHE_TAG = "storefront-catalog";

export function revalidateStorefrontCatalog() {
  revalidateTag(STOREFRONT_CATALOG_CACHE_TAG);
}
