import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homePage, homeClient, storefrontCatalog, shopPage, shopSort, productGrid, newestMigration] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeStorefrontClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/storefront-catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ShopSortSelect.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ProductGrid.tsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260803000100_newest_storefront_products.sql", import.meta.url), "utf8"),
]);

test("homepage keeps the popular-products shelf hidden before real sales", () => {
  assert.doesNotMatch(homeClient, /პოპულარული პროდუქტები|Popular products/);
  assert.doesNotMatch(homeClient, /popularProducts/);
  assert.doesNotMatch(homePage, /popularProducts=/);
  assert.match(storefrontCatalog, /if \(row\.section_key === "popular"\) continue;/);
});

test("catalog does not present curated ranking as popularity", () => {
  assert.match(shopSort, /\["featured", "რეკომენდებული"\]/);
  assert.match(shopSort, /\["featured", "Recommended"\]/);
  assert.match(shopSort, /\["sales", "ყველაზე გაყიდვადი"\]/);
  assert.match(shopSort, /\["sales", "Best selling"\]/);
});

test("catalog uses four product columns on wide desktop screens", () => {
  assert.match(productGrid, /sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4/);
  assert.match(productGrid, /\(min-width: 1280px\) calc\(\(100vw - 392px\) \/ 4\)/);
});

test("newly manager-published products lead home and catalog results", () => {
  assert.match(shopSort, /\["newest", "ახლად გამოქვეყნებული"\]/);
  assert.match(shopSort, /\["newest", "Newest"\]/);
  assert.match(shopPage, /sort = "newest"/);
  assert.match(storefrontCatalog, /requested_sort: options\.sort \|\| "newest"/);
  assert.match(newestMigration, /storefront_published_at timestamptz not null default now\(\)/);
  assert.match(newestMigration, /product\.catalog_audit_applied_at/);
  assert.match(newestMigration, /card\.storefront_published_at desc, card\.product_id asc/);
  assert.doesNotMatch(newestMigration, /order by card\.refreshed_at/);
});
