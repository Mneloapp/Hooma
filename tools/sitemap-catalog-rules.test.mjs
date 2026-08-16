import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  isProductionCompatibleSitemapKey,
  loadStorefrontSitemapCatalog,
  resolveStorefrontSitemapConfig,
} from "../lib/storefront-sitemap.ts";

const requiredProductSlugs = [
  "true-spring-3037752",
  "bambu-lab-p2s-3039863",
  "ptfe-ams-1-ams-2-pro-3047971",
];

const productRows = requiredProductSlugs.map((slug, index) => ({
  slug,
  category_slug: ["household", "3d-printer", "tools"][index],
  hero_image: null,
  refreshed_at: `2026-08-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
}));

const categoryRows = [
  { slug: "household" },
  { slug: "3d-printer" },
  { slug: "tools" },
];

function createFixtureClient({
  productPages = new Map([[0, productRows]]),
  productErrorAt,
  productError,
  productThrowAt,
  productThrow,
  categories = categoryRows,
  categoryError,
  categoryThrow,
} = {}) {
  const calls = [];

  return {
    calls,
    from(table) {
      calls.push({ operation: "from", table });

      if (table === "storefront_product_cards") {
        const query = {
          select(columns) {
            calls.push({ operation: "select", table, columns });
            return query;
          },
          order(column, options) {
            calls.push({ operation: "order", table, column, options });
            return query;
          },
          range(from, to) {
            calls.push({ operation: "range", table, from, to });
            if (productThrowAt === from) return Promise.reject(productThrow);
            if (productErrorAt === from) {
              return Promise.resolve({ data: null, error: productError });
            }
            return Promise.resolve({ data: productPages.get(from) ?? [], error: null });
          },
        };
        return query;
      }

      if (table === "categories") {
        const query = {
          select(columns) {
            calls.push({ operation: "select", table, columns });
            return query;
          },
          eq(column, value) {
            calls.push({ operation: "eq", table, column, value });
            return query;
          },
          is(column, value) {
            calls.push({ operation: "is", table, column, value });
            return query;
          },
          order(column, options) {
            calls.push({ operation: "order", table, column, options });
            if (categoryThrow) return Promise.reject(categoryThrow);
            return Promise.resolve({ data: categories, error: categoryError ?? null });
          },
        };
        return query;
      }

      throw new Error(`Unexpected fixture table: ${table}`);
    },
  };
}

function captureFailures() {
  const failures = [];
  return { failures, logger: (failure) => failures.push(failure) };
}

test("sitemap config selects the server secret and never falls back to the public key", () => {
  const modernSecret = ["sb", "secret", "fixture_value_1234567890"].join("_");
  const resolved = resolveStorefrontSitemapConfig({
    NEXT_PUBLIC_SUPABASE_URL: " https://fixture.supabase.co ",
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    SUPABASE_SECRET_KEY: ` ${modernSecret} `,
  });
  assert.deepEqual(resolved, {
    supabaseUrl: "https://fixture.supabase.co",
    secretKey: modernSecret,
  });
  assert.throws(
    () => resolveStorefrontSitemapConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_fixture",
    }),
    { message: "STOREFRONT_SITEMAP_CONFIG_MISSING" },
  );
  assert.throws(
    () => resolveStorefrontSitemapConfig({
      NEXT_PUBLIC_SUPABASE_URL: "https://fixture.supabase.co",
      SUPABASE_SECRET_KEY: "sb_publishable_fixture_value_1234567890",
    }),
    { message: "STOREFRONT_SITEMAP_KEY_INVALID" },
  );
});

test("legacy sitemap keys must be service-role credentials for the same Supabase project", () => {
  const legacyToken = (payload) => [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "fixture-signature",
  ].join(".");
  const matchingServiceRole = legacyToken({ iss: "supabase", ref: "fixture", role: "service_role" });

  assert.equal(
    isProductionCompatibleSitemapKey("https://fixture.supabase.co", matchingServiceRole),
    true,
  );
  assert.equal(
    isProductionCompatibleSitemapKey(
      "https://fixture.supabase.co",
      legacyToken({ iss: "supabase", ref: "other-project", role: "service_role" }),
    ),
    false,
  );
  assert.equal(
    isProductionCompatibleSitemapKey(
      "https://fixture.supabase.co",
      legacyToken({ iss: "supabase", ref: "fixture", role: "anon" }),
    ),
    false,
  );
});

test("dedicated sitemap client is server-only, session-free, and delegates API-key headers to Supabase", async () => {
  const [clientSource, coreSource, migration] = await Promise.all([
    readFile(new URL("../lib/supabase/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/storefront-sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/20260720000100_scalable_storefront_catalog.sql", import.meta.url), "utf8"),
  ]);

  assert.match(clientSource, /import "server-only"/);
  assert.match(clientSource, /createClient\(supabaseUrl, secretKey/);
  assert.match(clientSource, /autoRefreshToken:\s*false/);
  assert.match(clientSource, /persistSession:\s*false/);
  assert.match(clientSource, /detectSessionInUrl:\s*false/);
  assert.doesNotMatch(clientSource, /@supabase\/ssr|next\/headers|cookies\(|Authorization|Bearer/);
  assert.match(coreSource, /environment\.NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(coreSource, /environment\.SUPABASE_SECRET_KEY/);
  assert.doesNotMatch(coreSource, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(migration, /revoke all on public\.storefront_product_cards from public, anon, authenticated;/);
  assert.match(migration, /grant select on public\.storefront_product_cards to service_role;/);
});

test("public sitemap rows use the approved storefront read model and active root categories", async () => {
  const client = createFixtureClient();
  const catalog = await loadStorefrontSitemapCatalog(client);

  assert.deepEqual(catalog.products.map((product) => product.slug), requiredProductSlugs);
  assert.deepEqual(catalog.categorySlugs, categoryRows.map((category) => category.slug));
  assert.deepEqual(
    client.calls.filter((call) => call.operation === "from").map((call) => call.table).sort(),
    ["categories", "storefront_product_cards"],
  );
  assert.ok(client.calls.some((call) => (
    call.operation === "select"
      && call.table === "storefront_product_cards"
      && call.columns === "product_id,slug,category_slug,hero_image,refreshed_at"
  )));
  assert.ok(client.calls.some((call) => (
    call.operation === "eq" && call.table === "categories" && call.column === "is_active" && call.value === true
  )));
  assert.ok(client.calls.some((call) => (
    call.operation === "is" && call.table === "categories" && call.column === "parent_id" && call.value === null
  )));
});

test("a later product-page failure cannot return a partial real-data sitemap or leak its response", async () => {
  const sensitiveMarker = "sensitive-product-response-fixture";
  const firstPage = Array.from({ length: 1000 }, (_, index) => ({
    ...productRows[index % productRows.length],
    slug: `fixture-${index}`,
  }));
  const client = createFixtureClient({
    productPages: new Map([[0, firstPage]]),
    productErrorAt: 1000,
    productError: {
      message: sensitiveMarker,
      details: sensitiveMarker,
      hint: sensitiveMarker,
      response: sensitiveMarker,
    },
  });
  const { failures, logger } = captureFailures();

  await assert.rejects(
    loadStorefrontSitemapCatalog(client, logger),
    { message: "STOREFRONT_SITEMAP_PRODUCTS_READ_FAILED" },
  );
  assert.deepEqual(failures, [{
    event: "storefront_sitemap_catalog_failed",
    stage: "products",
    code: "STOREFRONT_SITEMAP_PRODUCTS_READ_FAILED",
  }]);
  assert.doesNotMatch(JSON.stringify(failures), new RegExp(sensitiveMarker));
});

test("transport and category failures surface only stable redacted diagnostics", async () => {
  const sensitiveMarker = "sensitive-secret-and-error-response-fixture";
  const productCapture = captureFailures();
  await assert.rejects(
    loadStorefrontSitemapCatalog(createFixtureClient({
      productThrowAt: 0,
      productThrow: new Error(sensitiveMarker),
    }), productCapture.logger),
    { message: "STOREFRONT_SITEMAP_PRODUCTS_READ_FAILED" },
  );

  const categoryCapture = captureFailures();
  await assert.rejects(
    loadStorefrontSitemapCatalog(createFixtureClient({
      categoryError: {
        message: sensitiveMarker,
        details: sensitiveMarker,
        hint: sensitiveMarker,
        response: sensitiveMarker,
      },
    }), categoryCapture.logger),
    { message: "STOREFRONT_SITEMAP_CATEGORIES_READ_FAILED" },
  );

  const diagnostics = JSON.stringify([...productCapture.failures, ...categoryCapture.failures]);
  assert.doesNotMatch(diagnostics, new RegExp(sensitiveMarker));
  assert.deepEqual(categoryCapture.failures, [{
    event: "storefront_sitemap_catalog_failed",
    stage: "categories",
    code: "STOREFRONT_SITEMAP_CATEGORIES_READ_FAILED",
  }]);
});

test("zero products or categories fail visibly instead of returning a static-only sitemap", async () => {
  const productCapture = captureFailures();
  await assert.rejects(
    loadStorefrontSitemapCatalog(createFixtureClient({
      productPages: new Map([[0, []]]),
    }), productCapture.logger),
    { message: "STOREFRONT_SITEMAP_PRODUCTS_EMPTY" },
  );
  assert.equal(productCapture.failures[0]?.code, "STOREFRONT_SITEMAP_PRODUCTS_EMPTY");

  const categoryCapture = captureFailures();
  await assert.rejects(
    loadStorefrontSitemapCatalog(createFixtureClient({ categories: [] }), categoryCapture.logger),
    { message: "STOREFRONT_SITEMAP_CATEGORIES_EMPTY" },
  );
  assert.equal(categoryCapture.failures[0]?.code, "STOREFRONT_SITEMAP_CATEGORIES_EMPTY");
});

test("the app route and HTTP regression require real category and known-product URLs", async () => {
  const [appSitemap, storefrontCatalog, regression] = await Promise.all([
    readFile(new URL("../app/sitemap.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/storefront-catalog.ts", import.meta.url), "utf8"),
    readFile(new URL("../scripts/seo-regression.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(appSitemap, /getStorefrontSitemapCatalog\(\)/);
  assert.doesNotMatch(appSitemap, /getStorefrontPublicCategorySlugs|getStorefrontSitemapEntries/);
  assert.match(storefrontCatalog, /createSitemapCatalogClient\(\)/);
  assert.match(storefrontCatalog, /loadStorefrontSitemapCatalog\(client as any\)/);
  assert.match(storefrontCatalog, /\["storefront-sitemap-catalog-v2"\]/);
  assert.match(regression, /sitemapCategoryUrls\.length > 0/);
  assert.match(regression, /sitemapProductUrls\.length > 0/);
  assert.match(regression, /admin\|api\|account\|cart\|checkout\|login\|search/);
  for (const slug of requiredProductSlugs) assert.match(regression, new RegExp(slug));
});
