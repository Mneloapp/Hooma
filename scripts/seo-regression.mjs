import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const baseUrl = (process.env.SEO_BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
const canonicalOrigin = "https://hooma.ge";
const timeoutMs = 30_000;

function decodeHtml(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#x27;", "'")
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

async function request(path, options = {}) {
  const response = await fetch(new URL(path, `${baseUrl}/`), {
    redirect: options.redirect || "follow",
    headers: options.headers,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (options.binary) {
    return { response, bytes: Buffer.from(await response.arrayBuffer()) };
  }
  return { response, body: await response.text() };
}

function tags(html, name) {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, "gi"))].map((match) => match[0]);
}

function attributes(tag) {
  return Object.fromEntries(
    [...tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)]
      .map((match) => [match[1].toLowerCase(), decodeHtml(match[2] ?? match[3] ?? "")]),
  );
}

function meta(html, key) {
  for (const tag of tags(html, "meta")) {
    const attrs = attributes(tag);
    if (attrs.name === key || attrs.property === key) return attrs.content || "";
  }
  return "";
}

export function canonicalUrls(html) {
  const values = [];
  for (const tag of tags(html, "link")) {
    const attrs = attributes(tag);
    const rel = attrs.rel?.split(/\s+/).map((value) => value.toLowerCase());
    if (rel?.includes("canonical")) values.push(attrs.href ?? "");
  }
  return values;
}

export function canonical(html, label = "page") {
  const values = canonicalUrls(html);
  assert.equal(values.length, 1, `${label} must emit exactly one canonical`);

  const value = values[0].trim();
  assert.ok(value, `${label} canonical must not be empty`);

  let url;
  try {
    url = new URL(value);
  } catch {
    assert.fail(`${label} canonical must be an absolute URL`);
  }

  assert.equal(url.search, "", `${label} canonical must not include a query`);
  assert.equal(url.hash, "", `${label} canonical must not include a hash`);
  return url.href;
}

export function assertCanonical(html, expectedCanonical, label = "page") {
  const expected = new URL(expectedCanonical).href;
  assert.equal(canonical(html, label), expected, `${label} canonical must use the apex host`);
}

function title(html) {
  return decodeHtml(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "").trim();
}

function jsonLd(html) {
  return [...html.matchAll(/<script\b[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => JSON.parse(match[1]));
}

function schemaOfType(items, type) {
  return items.find((item) => item?.["@type"] === type);
}

function hrefs(html) {
  return tags(html, "a").map((tag) => attributes(tag).href).filter(Boolean);
}

function assertNoindex(html, label) {
  assert.match(meta(html, "robots"), /\bnoindex\b/i, `${label} must emit noindex`);
}

function assertPublicMetadata(html, expectedCanonical, label) {
  assertCanonical(html, expectedCanonical, label);
  assert.ok(title(html), `${label} must have a title`);
  assert.ok(meta(html, "description"), `${label} must have a description`);
  assert.ok(meta(html, "og:title"), `${label} must have an Open Graph title`);
  assert.ok(meta(html, "og:description"), `${label} must have an Open Graph description`);
  assert.ok(meta(html, "og:image"), `${label} must have an Open Graph image`);
  assert.ok(meta(html, "twitter:card"), `${label} must have Twitter metadata`);
  assert.doesNotMatch(html, /https:\/\/www\.hooma\.ge/i, `${label} must not reference www`);
}

async function main() {
  const checks = [];
  const pass = (name) => checks.push(name);

  const robotsResult = await request("/robots.txt");
  assert.equal(robotsResult.response.status, 200);
  assert.match(robotsResult.response.headers.get("content-type") || "", /text\/plain/);
  assert.match(robotsResult.body, /^Sitemap: https:\/\/hooma\.ge\/sitemap\.xml$/m);
  for (const path of ["/admin", "/api", "/login", "/account", "/cart", "/checkout", "/search"]) {
    assert.ok(robotsResult.body.includes(`Disallow: ${path}`), `robots.txt must disallow ${path}`);
  }
  pass("robots policy");

  const sitemapResult = await request("/sitemap.xml");
  assert.equal(sitemapResult.response.status, 200);
  assert.match(sitemapResult.response.headers.get("content-type") || "", /xml/);
  const sitemapUrls = [...sitemapResult.body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decodeHtml(match[1]));
  assert.ok(sitemapUrls.length > 10, "sitemap must include public catalog URLs");
  assert.equal(new Set(sitemapUrls).size, sitemapUrls.length, "sitemap URLs must be unique");
  for (const url of sitemapUrls) {
    assert.ok(url.startsWith(`${canonicalOrigin}/`), `sitemap URL must use ${canonicalOrigin}: ${url}`);
    assert.doesNotMatch(url, /[?]|\/(admin|api|account|cart|checkout|login)(\/|$)/, `forbidden sitemap URL: ${url}`);
  }
  pass("sitemap uniqueness and exclusions");

  const homeResult = await request("/");
  assert.equal(homeResult.response.status, 200);
  assert.ok(Buffer.byteLength(homeResult.body) < 300_000, "homepage raw HTML must remain below 300 KB");
  assertPublicMetadata(homeResult.body, canonicalOrigin, "homepage");
  assert.equal(meta(homeResult.body, "og:image"), `${canonicalOrigin}/opengraph-image`);
  const homeLinks = hrefs(homeResult.body);
  assert.ok(homeLinks.some((href) => href.startsWith("/shop/")), "homepage must link to a category anchor");
  assert.ok(homeLinks.some((href) => href.startsWith("/product/")), "homepage must link to a product anchor");
  const storeSchema = schemaOfType(jsonLd(homeResult.body), "OnlineStore");
  assert.equal(storeSchema?.url, `${canonicalOrigin}/`);
  assert.ok(storeSchema?.logo?.url, "OnlineStore must include the real logo");
  pass("homepage metadata, links, size budget, and OnlineStore JSON-LD");

  const categoryUrls = sitemapUrls.filter((url) => {
    const pathname = new URL(url).pathname;
    return pathname.startsWith("/shop/") && pathname.split("/").filter(Boolean).length === 2;
  });
  let categoryResult;
  let categoryUrl;
  let categoryProductPaths = [];
  for (const candidate of categoryUrls) {
    const result = await request(new URL(candidate).pathname);
    const productPaths = [...new Set(hrefs(result.body).filter((href) => href.startsWith("/product/")))];
    if (result.response.status === 200 && productPaths.length >= 3) {
      categoryResult = result;
      categoryUrl = candidate;
      categoryProductPaths = productPaths;
      break;
    }
  }
  assert.ok(categoryResult && categoryUrl, "a public category must expose at least three product anchors");
  const categoryPath = new URL(categoryUrl).pathname;
  assertPublicMetadata(categoryResult.body, categoryUrl, "category");
  assert.ok(schemaOfType(jsonLd(categoryResult.body), "BreadcrumbList"), "category must include BreadcrumbList JSON-LD");
  pass("category metadata, breadcrumb, and crawlable product links");

  const metadataSamples = [
    { title: title(homeResult.body), description: meta(homeResult.body, "description") },
    { title: title(categoryResult.body), description: meta(categoryResult.body, "description") },
  ];
  for (const productPath of categoryProductPaths.slice(0, 3)) {
    const productResult = await request(productPath);
    assert.equal(productResult.response.status, 200, `${productPath} must return 200`);
    const expectedCanonical = `${canonicalOrigin}${productPath}`;
    assertPublicMetadata(productResult.body, expectedCanonical, productPath);
    assert.notEqual(meta(productResult.body, "og:image"), `${canonicalOrigin}/opengraph-image`);
    const schemas = jsonLd(productResult.body);
    const product = schemaOfType(schemas, "Product");
    assert.ok(product, `${productPath} must include Product JSON-LD`);
    assert.ok(schemaOfType(schemas, "BreadcrumbList"), `${productPath} must include BreadcrumbList JSON-LD`);
    assert.equal(product.url, expectedCanonical);
    assert.ok(Array.isArray(product.image) && product.image.length > 0);
    assert.ok(typeof product.sku === "string" && product.sku.length > 0);
    assert.ok(Number(product.offers?.price) > 0);
    assert.equal(product.offers?.priceCurrency, "GEL");
    assert.match(product.offers?.availability || "", /^https:\/\/schema\.org\/(InStock|OutOfStock)$/);
    assert.equal(product.offers?.url, expectedCanonical);
    assert.equal(product.aggregateRating, undefined, "ratings must not be invented in JSON-LD");
    metadataSamples.push({ title: title(productResult.body), description: meta(productResult.body, "description") });
  }
  assert.equal(new Set(metadataSamples.map((sample) => sample.title)).size, metadataSamples.length);
  assert.equal(new Set(metadataSamples.map((sample) => sample.description)).size, metadataSamples.length);
  pass("three products: unique metadata and real Product/Offer/Breadcrumb data");

  const filteredCategory = await request(`${categoryPath}?q=holder&sort=price-asc`);
  assert.equal(filteredCategory.response.status, 200);
  assertNoindex(filteredCategory.body, "filtered category");
  assertCanonical(filteredCategory.body, categoryUrl, "filtered category");
  const searchResult = await request("/shop?q=holder");
  assert.equal(searchResult.response.status, 200);
  assertNoindex(searchResult.body, "internal search");
  assertCanonical(searchResult.body, `${canonicalOrigin}/shop`, "internal search");
  pass("search and filter noindex/canonical policy");

  for (const privatePath of ["/cart", "/login"]) {
    const privateResult = await request(privatePath);
    assert.equal(privateResult.response.status, 200, `${privatePath} must resolve`);
    assertNoindex(privateResult.body, privatePath);
  }
  const checkoutResult = await request("/checkout");
  assert.equal(checkoutResult.response.status, 200);
  assertNoindex(checkoutResult.body, "checkout/login flow");
  pass("private cart, checkout, and login noindex policy");

  const legacyResult = await request(categoryProductPaths[0].replace("/product/", "/products/"), { redirect: "manual" });
  assert.equal(legacyResult.response.status, 308);
  assert.equal(legacyResult.response.headers.get("location"), categoryProductPaths[0]);
  assert.equal((await request("/product/seo-regression-unknown-product")).response.status, 404);
  assert.equal((await request("/shop/seo-regression-unknown-category")).response.status, 404);
  pass("legacy 308 and unknown 404 behavior");

  const ogResult = await request("/opengraph-image", { binary: true });
  assert.equal(ogResult.response.status, 200);
  assert.match(ogResult.response.headers.get("content-type") || "", /image\/png/);
  assert.ok(ogResult.bytes.length > 5_000);
  assert.equal(ogResult.bytes.readUInt32BE(16), 1200);
  assert.equal(ogResult.bytes.readUInt32BE(20), 630);
  pass("1200×630 Open Graph image route");

  const hostileOrigin = "https://host-injection.invalid";
  const hostileResult = await request("/auth/confirm?type=email", {
    redirect: "manual",
    headers: { host: "host-injection.invalid", "x-forwarded-host": "host-injection.invalid", "x-forwarded-proto": "https" },
  });
  assert.ok([307, 308].includes(hostileResult.response.status));
  const hostileLocation = hostileResult.response.headers.get("location") || "";
  assert.ok(hostileLocation && !hostileLocation.startsWith(hostileOrigin), "auth redirect must ignore hostile Host headers");
  pass("hostile Host redirect protection");

  if (process.env.SEO_EXPECT_PREVIEW_NOINDEX === "true") {
    assert.equal(homeResult.response.headers.get("x-robots-tag"), "noindex, nofollow, noarchive");
    pass("Preview X-Robots-Tag");
  } else {
    pass("Preview X-Robots-Tag check intentionally skipped outside Preview");
  }

  if (process.env.SEO_CHECK_LIVE_HOSTS === "true") {
    const wwwResponse = await fetch("https://www.hooma.ge/", { redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    assert.equal(wwwResponse.status, 308);
    assert.equal(wwwResponse.headers.get("location"), `${canonicalOrigin}/`);
    pass("live www → apex redirect");
  } else {
    pass("live www redirect intentionally deferred");
  }

  console.log(`SEO regression passed: ${checks.length} checks`);
  for (const check of checks) console.log(`✓ ${check}`);
  console.log(`Samples: ${categoryPath}, ${categoryProductPaths.slice(0, 3).join(", ")}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error("SEO regression failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
