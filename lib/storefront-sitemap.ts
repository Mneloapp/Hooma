export type StorefrontSitemapProductRow = {
  slug: string;
  category_slug: string;
  hero_image: string | null;
  refreshed_at: string;
};

export type StorefrontSitemapConfig = {
  supabaseUrl: string;
  secretKey: string;
};

const SITEMAP_CONFIG_MISSING = "STOREFRONT_SITEMAP_CONFIG_MISSING";
const SITEMAP_KEY_INVALID = "STOREFRONT_SITEMAP_KEY_INVALID";

function supabaseProjectRef(supabaseUrl: string) {
  try {
    const hostname = new URL(supabaseUrl).hostname.toLowerCase();
    const suffix = ".supabase.co";
    return hostname.endsWith(suffix) ? hostname.slice(0, -suffix.length) : null;
  } catch {
    return null;
  }
}

function isMatchingLegacyServiceRoleKey(secretKey: string, projectRef: string | null) {
  if (!projectRef) return false;
  const parts = secretKey.split(".");
  if (parts.length !== 3) return false;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
      iss?: unknown;
      ref?: unknown;
      role?: unknown;
    };
    return payload.iss === "supabase"
      && payload.ref === projectRef
      && payload.role === "service_role";
  } catch {
    return false;
  }
}

export function isProductionCompatibleSitemapKey(supabaseUrl: string, secretKey: string) {
  if (secretKey.startsWith("sb_secret_") && secretKey.length >= 24) return true;
  return isMatchingLegacyServiceRoleKey(secretKey, supabaseProjectRef(supabaseUrl));
}

export function resolveStorefrontSitemapConfig(
  environment: Readonly<Record<string, string | undefined>>,
): StorefrontSitemapConfig {
  const supabaseUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  if (!supabaseUrl || !secretKey) throw new Error(SITEMAP_CONFIG_MISSING);
  if (!isProductionCompatibleSitemapKey(supabaseUrl, secretKey)) throw new Error(SITEMAP_KEY_INVALID);
  return { supabaseUrl, secretKey };
}

export type StorefrontSitemapCatalogRows = {
  products: StorefrontSitemapProductRow[];
  categorySlugs: string[];
};

export type StorefrontSitemapCatalogClient = {
  from(table: string): any;
};

export type StorefrontSitemapFailure = Readonly<{
  event: "storefront_sitemap_catalog_failed";
  stage: "products" | "categories";
  code:
    | "STOREFRONT_SITEMAP_PRODUCTS_READ_FAILED"
    | "STOREFRONT_SITEMAP_PRODUCTS_EMPTY"
    | "STOREFRONT_SITEMAP_CATEGORIES_READ_FAILED"
    | "STOREFRONT_SITEMAP_CATEGORIES_EMPTY";
}>;

export type StorefrontSitemapLogger = (failure: StorefrontSitemapFailure) => void;

const defaultLogger: StorefrontSitemapLogger = (failure) => {
  console.error("[storefront-sitemap]", failure);
};

function fail(
  stage: StorefrontSitemapFailure["stage"],
  code: StorefrontSitemapFailure["code"],
  logger: StorefrontSitemapLogger,
): never {
  logger({ event: "storefront_sitemap_catalog_failed", stage, code });
  throw new Error(code);
}

async function loadProducts(
  client: StorefrontSitemapCatalogClient,
  logger: StorefrontSitemapLogger,
): Promise<StorefrontSitemapProductRow[]> {
  const pageSize = 1000;
  const products: StorefrontSitemapProductRow[] = [];

  for (let from = 0; ; from += pageSize) {
    let result: { data: unknown; error: unknown };
    try {
      result = await client
        .from("storefront_product_cards")
        .select("product_id,slug,category_slug,hero_image,refreshed_at")
        .order("product_id", { ascending: true })
        .range(from, from + pageSize - 1);
    } catch {
      fail("products", "STOREFRONT_SITEMAP_PRODUCTS_READ_FAILED", logger);
    }

    if (result.error || !Array.isArray(result.data)) {
      fail("products", "STOREFRONT_SITEMAP_PRODUCTS_READ_FAILED", logger);
    }

    const rows = result.data as StorefrontSitemapProductRow[];
    products.push(...rows);
    if (rows.length < pageSize) break;
  }

  if (!products.length) fail("products", "STOREFRONT_SITEMAP_PRODUCTS_EMPTY", logger);
  return products;
}

async function loadCategorySlugs(
  client: StorefrontSitemapCatalogClient,
  logger: StorefrontSitemapLogger,
): Promise<string[]> {
  let result: { data: unknown; error: unknown };
  try {
    result = await client
      .from("categories")
      .select("slug")
      .eq("is_active", true)
      .is("parent_id", null)
      .order("sort_order", { ascending: true });
  } catch {
    fail("categories", "STOREFRONT_SITEMAP_CATEGORIES_READ_FAILED", logger);
  }

  if (result.error || !Array.isArray(result.data)) {
    fail("categories", "STOREFRONT_SITEMAP_CATEGORIES_READ_FAILED", logger);
  }

  const categorySlugs = result.data.flatMap((row: { slug?: unknown }) => (
    typeof row.slug === "string" && row.slug.trim() ? [row.slug] : []
  ));
  if (!categorySlugs.length) fail("categories", "STOREFRONT_SITEMAP_CATEGORIES_EMPTY", logger);
  return categorySlugs;
}

export async function loadStorefrontSitemapCatalog(
  client: StorefrontSitemapCatalogClient,
  logger: StorefrontSitemapLogger = defaultLogger,
): Promise<StorefrontSitemapCatalogRows> {
  const [products, categorySlugs] = await Promise.all([
    loadProducts(client, logger),
    loadCategorySlugs(client, logger),
  ]);
  return { products, categorySlugs };
}
