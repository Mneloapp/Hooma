# Hooma SEO Regression Tests

The integration adds a read-only HTTP suite with twelve checks. It never creates an order, payment, refund, cancellation, account, review, or database mutation.

## Run

Against a production build running locally:

```sh
SEO_BASE_URL=http://127.0.0.1:3000 pnpm run test:seo
```

Against the approved Git-connected Preview:

```sh
SEO_BASE_URL=https://PREVIEW-URL SEO_EXPECT_PREVIEW_NOINDEX=true pnpm run test:seo
```

Use the project’s existing environment through the normal local/Vercel mechanism. Do not print environment values or copy production secrets into the report.

## Covered assertions

1. robots status, MIME type, sitemap reference, and private-route exclusions;
2. sitemap status, uniqueness, apex host, public catalog content, and exclusions;
3. homepage metadata, OnlineStore JSON-LD, crawlable category/product anchors, and `<300 KB` raw HTML budget;
4. category metadata, BreadcrumbList, and at least three product anchors;
5. three real products with unique metadata and real Product/Offer/Breadcrumb data;
6. search/filter `noindex` and base canonical policy;
7. cart/login/checkout noindex and login gate;
8. legacy 308 and unknown product/category 404;
9. PNG MIME type and exact 1200×630 OG dimensions;
10. hostile Host headers cannot control auth redirect destinations;
11. Preview-only `X-Robots-Tag` when explicitly required;
12. optional live `www` redirect after its separate owner-approved configuration.

The suite parses every sampled JSON-LD block with `JSON.parse`. Product assertions require a positive real price, `GEL`, SKU, public URL, image, and valid Schema.org availability. It explicitly rejects invented `AggregateRating`.

`SEO_CHECK_LIVE_HOSTS=true` must only be used after the domain redirect is approved and configured. Until then, that check is recorded as intentionally deferred.
