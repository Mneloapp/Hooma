import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import test from "node:test";

const [homePage, homeClient, homeCategoryHero, homeProductShelf, homeProductCard, storefrontCatalog, shopPage, shopSort, productGrid, newestMigration] = await Promise.all([
  readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeStorefrontClient.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeCategoryHero.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeProductShelf.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/home/HomeProductCard.tsx", import.meta.url), "utf8"),
  readFile(new URL("../lib/storefront-catalog.ts", import.meta.url), "utf8"),
  readFile(new URL("../app/shop/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ShopSortSelect.tsx", import.meta.url), "utf8"),
  readFile(new URL("../components/ProductGrid.tsx", import.meta.url), "utf8"),
  readFile(new URL("../supabase/migrations/20260803000100_newest_storefront_products.sql", import.meta.url), "utf8"),
]);
const categoryPosterSlugs = [
  "household",
  "art",
  "education",
  "fashion",
  "hobbies-diy",
  "miniatures",
  "props-cosplay",
  "tools",
  "toys-games",
  "generative-3d-model",
  "3d-printer",
];
const categoryHeroImages = await Promise.all(
  categoryPosterSlugs.map((slug) =>
    stat(new URL(`../public/homepage/${slug}-category-hero.webp`, import.meta.url)),
  ),
);

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
  assert.match(homePage, /const HOME_CATEGORY_PRODUCTS = 6/);
  assert.match(homePage, /getStorefrontHomeCards\(HOME_CATEGORY_PRODUCTS\)/);
});

test("homepage opens with a scrollable poster for every catalog category", () => {
  assert.match(homeClient, /<HomeCategoryHero \/>/);
  assert.match(homeClient, /-mt-8[\s\S]{0,80}sm:-mt-12/);
  assert.ok(homeClient.indexOf("<HomeCategoryHero />") < homeClient.indexOf('max-w-[1480px]'));
  assert.doesNotMatch(homeClient, /დამზადებულია თბილისში|შემოწმებული ოპერატორის მიერ/);
  assert.doesNotMatch(homeClient, /\[Clock3/);
  const posterSlugs = [...homeCategoryHero.matchAll(/slug: "([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(posterSlugs, categoryPosterSlugs);
  for (const slug of categoryPosterSlugs) {
    assert.match(homeCategoryHero, new RegExp(`image: "\\/homepage\\/${slug}-category-hero\\.webp"`));
  }
  assert.match(homeCategoryHero, /import \{ categoryPath \} from "@\/lib\/seo"/);
  assert.match(homeCategoryHero, /href=\{categoryPath\(poster\.slug\)\}/);
  assert.match(homeCategoryHero, /sizes="100vw"/);
  assert.match(homeCategoryHero, /priority=\{index === 0\}/);
  assert.match(homeCategoryHero, /საყოფაცხოვრებო ნივთები ყოველდღიური ცხოვრებისთვის/);
  assert.match(homeCategoryHero, /Household objects for everyday life/);
  assert.match(homeCategoryHero, /ხელოვნება შენი სივრცის გასაცოცხლებლად/);
  assert.match(homeCategoryHero, /სასწავლო მოდელები აღმოჩენისა და სწავლისთვის/);
  assert.match(homeCategoryHero, /აქსესუარები გამორჩეული სტილისთვის/);
  assert.match(homeCategoryHero, /ჰობისა და DIY იდეების გასაცოცხლებლად/);
  assert.match(homeCategoryHero, /მინიატიურები დიდი ისტორიებისთვის/);
  assert.match(homeCategoryHero, /რეკვიზიტები შენი პერსონაჟის გასაცოცხლებლად/);
  assert.match(homeCategoryHero, /პრაქტიკული ხელსაწყოები საქმის გასამარტივებლად/);
  assert.match(homeCategoryHero, /სათამაშოები მეტი ფანტაზიისა და გართობისთვის/);
  assert.match(homeCategoryHero, /გენერაციული 3D ფორმები უნიკალური სივრცისთვის/);
  assert.match(homeCategoryHero, /3D პრინტერის აქსესუარები უკეთესი ბეჭდვისთვის/);
  assert.match(homeCategoryHero, /aria-label=\{title\}/);
  assert.match(homeCategoryHero, /alt=""/);
  assert.match(homeCategoryHero, /focus-visible:ring-2/);
  assert.match(homeCategoryHero, /h-\[380px\]/);
  assert.match(homeCategoryHero, /xl:object-contain xl:object-right/);
  assert.match(homeCategoryHero, /via-\[#0d1929\]\/80[\s\S]{0,100}sm:via-\[#0d1929\]\/75/);
  assert.match(homeCategoryHero, /snap-x snap-mandatory overflow-x-auto/);
  assert.doesNotMatch(homeCategoryHero, /scroll-smooth/);
  assert.match(homeCategoryHero, /w-full shrink-0 snap-center/);
  assert.match(homeCategoryHero, /moveByPoster\(-1\)/);
  assert.match(homeCategoryHero, /moveByPoster\(1\)/);
  assert.match(homeCategoryHero, /aria-current=\{index === activeIndex \? "true" : undefined\}/);
  assert.match(homeCategoryHero, /tabIndex=\{index === activeIndex \? 0 : -1\}/);
  assert.match(homeCategoryHero, /aria-hidden=\{index !== activeIndex\}/);
  assert.match(homeCategoryHero, /aria-live="polite"/);
  assert.match(homeCategoryHero, /sm:hidden[\s\S]{0,100}\{activeIndex \+ 1\} \/ \{categoryPosters\.length\}/);
  assert.match(homeCategoryHero, /hidden items-center[\s\S]{0,120}sm:flex/);
  assert.match(homeCategoryHero, /inline-flex size-6 items-center justify-center/);
  assert.match(homeCategoryHero, /ResizeObserver/);
  assert.match(homeCategoryHero, /observer\.disconnect\(\)/);
  assert.match(homeCategoryHero, /activeIndexRef\.current \* nextWidth/);
  assert.match(homeCategoryHero, /hidden size-11[\s\S]{0,160}sm:inline-flex/);
  const scrollToPosterSource = homeCategoryHero.slice(
    homeCategoryHero.indexOf("const scrollToPoster"),
    homeCategoryHero.indexOf("const moveByPoster"),
  );
  assert.doesNotMatch(scrollToPosterSource, /setActiveIndex/);
  assert.equal(homeCategoryHero.match(/<h1\b/g)?.length, 1);
  assert.equal(homeCategoryHero.match(/<h2\b/g)?.length, 1);
  assert.match(homeCategoryHero, /<h1 className="sr-only">/);
  assert.doesNotMatch(homeCategoryHero, /setInterval|autoPlay|autoplay/);
  assert.doesNotMatch(homeCategoryHero, /<p|რჩეული კატეგორია|Featured category|Shop Household|დეკორი და პრაქტიკული/);
  assert.doesNotMatch(homeCategoryHero, /\/72/);
  assert.doesNotMatch(homeCategoryHero, /ProductCardData|posterProducts|grid-cols-12/);
  for (const image of categoryHeroImages) {
    assert.ok(image.size > 10_000 && image.size < 200_000);
  }
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
