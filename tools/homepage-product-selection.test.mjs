import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { selectRandomCategoryProducts, selectRandomItems } from "../lib/homepage-product-selection.ts";

const [homePage, storefrontCatalog] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/storefront-catalog.ts", import.meta.url), "utf8"),
]);

test("homepage chooses six products from a wider cached category pool on each dynamic render", () => {
  assert.match(homePage, /export const dynamic = "force-dynamic"/);
  assert.match(homePage, /const HOME_CATEGORY_PRODUCTS = 6/);
  assert.match(homePage, /const HOME_CATEGORY_CANDIDATES = 24/);
  assert.match(homePage, /getStorefrontHomeCards\(HOME_CATEGORY_CANDIDATES\)/);
  assert.match(homePage, /selectRandomCategoryProducts\(homeCards\.categoryProducts, HOME_CATEGORY_PRODUCTS\)/);
  assert.match(storefrontCatalog, /Math\.min\(24, Math\.max\(1, Math\.trunc\(perSection\)\)\)/);
});

test("random selection does not mutate or duplicate source products", () => {
  const source = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const snapshot = [...source];
  const selected = selectRandomItems(source, 6, () => 0);

  assert.deepEqual(source, snapshot);
  assert.equal(selected.length, 6);
  assert.equal(new Set(selected).size, 6);
  assert.ok(selected.every((item) => source.includes(item)));
  assert.notDeepEqual(selected, source.slice(0, 6));
});

test("each category is randomized independently and remains in its own category", () => {
  const source = {
    household: ["h1", "h2", "h3", "h4"],
    art: ["a1", "a2", "a3", "a4"],
  };
  const selected = selectRandomCategoryProducts(source, 2, () => 0);

  assert.deepEqual(Object.keys(selected), ["household", "art"]);
  assert.equal(selected.household.length, 2);
  assert.equal(selected.art.length, 2);
  assert.ok(selected.household.every((item) => item.startsWith("h")));
  assert.ok(selected.art.every((item) => item.startsWith("a")));
});

test("small categories remain visible and invalid random samples stay bounded", () => {
  assert.deepEqual(selectRandomItems(["only"], 6, () => Number.NaN), ["only"]);
  assert.deepEqual(selectRandomItems(["a", "b"], 0, () => 0.5), []);
});
