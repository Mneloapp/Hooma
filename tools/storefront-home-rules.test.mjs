import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homePage, homeClient, homeProductShelf, homeProductCard, storefrontCatalog, shopPage, shopSort, productGrid, newestMigration] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeStorefrontClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeProductShelf.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeProductCard.tsx", import.meta.url), "utf8"),
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

test("homepage moves the printer-technology category to the final category position only", () => {
  assert.match(homeClient, /catalogCategories\.filter\(\(category\) => category\.slug !== "3d-printer"\)/);
  assert.match(homeClient, /catalogCategories\.filter\(\(category\) => category\.slug === "3d-printer"\)/);
  assert.match(homeClient, /homepageCategories\.map\(\(category\)/);
  assert.match(homePage, /getStorefrontHomeCards\(12\)/);
});

test("homepage category cards are dense and omit price while Daily Deals keeps it", () => {
  assert.match(homeProductShelf, /w-\[calc\(\(100%_-_12px\)\/2\)\]/);
  assert.match(homeProductShelf, /sm:w-\[calc\(\(100%_-_32px\)\/3\)\]/);
  assert.match(homeProductShelf, /lg:w-\[calc\(\(100%_-_48px\)\/4\)\]/);
  assert.match(homeProductShelf, /xl:w-\[calc\(\(100%_-_80px\)\/6\)\]/);
  assert.match(homeProductShelf, /<HomeProductCard product=\{product\} showPrice=\{showPrice\}/);
  assert.match(homeProductCard, /showPrice \? \(/);
  assert.doesNotMatch(homeProductCard, /ProductRatingSummary|Clock3|shortDescription/);
  assert.match(homeProductCard, /showPrice && product\.discountPercent/);
  assert.match(homeProductCard, /alt=""/);
  assert.doesNotMatch(homeProductCard, /aria-label=\{productName\}/);
  assert.match(homeProductCard, /focus-visible:ring-2/);
  assert.match(homeProductCard, /aria-hidden="true"/);
  assert.match(homeProductShelf, /line-clamp-2 break-words text-xl/);
  assert.match(homeClient, /href="\/deals"[\s\S]{0,120}showPrice/);
  assert.doesNotMatch(homeClient, /<ProductShelf/);
});

test("custom-order CTA follows Daily Deals on the homepage", () => {
  const dailyDealsIndex = homeClient.indexOf('title={georgian ? "დღის შეთავაზებები" : "Daily deals"}');
  const customOrderIndex = homeClient.indexOf('"ვერ იპოვე საჭირო დეტალი? დაგიმზადებთ."');
  assert.ok(dailyDealsIndex >= 0);
  assert.ok(customOrderIndex > dailyDealsIndex);
  assert.equal(homeClient.match(/ვერ იპოვე საჭირო დეტალი\? დაგიმზადებთ\./g)?.length, 1);
});
