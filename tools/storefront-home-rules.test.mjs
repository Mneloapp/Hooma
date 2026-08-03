import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const [homePage, homeClient, storefrontCatalog, shopSort, productGrid] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeStorefrontClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/storefront-catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../components/ShopSortSelect.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ProductGrid.tsx", import.meta.url), "utf8"),
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
