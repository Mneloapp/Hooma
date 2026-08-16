# Hooma Technical SEO Audit — Main Integration

Recorded base: `a7d28c49f36d3a283e675d9adbb77fe2877b49ee` (`origin/main`)

## Routing and metadata architecture

Hooma uses Next.js 15 App Router. SEO is implemented with the Metadata API, route-level `generateMetadata`, Metadata Routes, and server-rendered JSON-LD. The canonical origin is defined once in `lib/seo.ts` as `https://hooma.ge`; the root layout sets `metadataBase`, a Georgian title template, default Open Graph/Twitter metadata, and `<html lang="ka">`.

The canonical public URL model is:

- homepage: `/`;
- shop: `/shop`;
- category: `/shop/[category]`;
- product: `/product/[slug]`;
- legacy product: `/products/[slug]` → 308 `/product/[slug]`.

Category and product metadata is generated from current catalog data. Product metadata and schema use the public Product returned by `getStorefrontProductBySlug`; neither browser-submitted data nor draft/admin preview data is used.

## Public indexable routes

| Route | Indexing rule | Canonical/schema |
|---|---|---|
| `/` | index, follow | self-canonical; OnlineStore |
| `/shop` | index only without query filters | self-canonical |
| `/shop/[category]` | active known category only | self-canonical; BreadcrumbList |
| `/product/[slug]` | current public publication read model only | self-canonical; Product, Offer, BreadcrumbList |
| `/deals` | index, follow | self-canonical |
| `/about`, `/contact`, `/faq`, `/hooma-plus`, `/how-it-works`, `/privacy`, `/terms` | index, follow | self-canonical |

`sitemap.xml` uses active root categories and `storefront_product_cards`. A product is therefore included only after the current publication, production approval, positive active variant, audit, and license/media rules have admitted it to the public read model. Query URLs and draft/private records are excluded.

## Private and noindex routes

- `/admin/**`, `/api/**`, `/auth/**`;
- `/login`, `/signup`, `/logout`;
- `/account/**`, `/cart`, `/checkout/**`, `/notifications`;
- product `?preview=` mode;
- shop/category URLs with search, material, subcategory, sort, or pagination parameters.

Private pages emit `noindex, nofollow`. Search/filter variants emit `noindex` and point to the unfiltered shop or category canonical. Vercel Preview responses additionally receive `X-Robots-Tag: noindex, nofollow, noarchive`; this header is not enabled for production.

## Confirmed baseline issues and disposition

| Issue | Baseline | Integration result |
|---|---|---|
| `robots.txt` / `sitemap.xml` | 404 | Metadata Routes added |
| repeated homepage metadata on products | present | real dynamic product metadata |
| canonical links | absent | apex self-canonicals |
| OG/Twitter | incomplete | shared complete metadata; product hero image |
| structured data | absent | OnlineStore, Product/Offer, BreadcrumbList |
| category crawl path | query-only | canonical `/shop/[category]` and HTML anchors |
| legacy product URL | temporary redirect | 308 permanent redirect |
| unknown category | no canonical route | real 404 |
| Host header redirects | request Host trusted | deployment/config-only trusted origin |
| Preview indexing | no global protection | Preview-only X-Robots-Tag |
| Next.js security | 15.5.20 advisories | scoped patch to 15.5.21 |
| lint | interactive `next lint` | non-interactive ESLint gate |

No `AggregateRating`, invented reviews, inventory count, shipping detail, return policy, or social `sameAs` URL is emitted. Those fields require verified real data.

## Performance audit

The baseline production homepage response was 440,700 bytes. The main cause was `getStorefrontHomeCards(12)`: up to twelve cards per catalog category plus twelve Daily Deal cards were serialized through the homepage client boundary. The visible wide-screen shelf displays six cards, so the low-risk integration reduces both limits to six while preserving every category, the category carousel, assistant, Hooma+, and ordinary product links.

Public catalog/home/product/sitemap reads now use short tag-based caches (5 minutes for display data, 15 minutes for sitemap data). Search text and all checkout/payment price resolution remain uncached. Existing authenticated admin publication, media, audit, review, and settings mutations already call the central invalidator; the invalidator now fans out to all new tags.

MakerWorld card/gallery URLs request bounded WebP derivatives from the existing source CDN. Supabase and local assets are left unchanged. Product hero images retain responsive `sizes`; the product gallery hero remains priority, normal cards remain lazy-loaded, and the homepage category LCP poster retains its existing priority/preload behavior. `images.unoptimized` remains intentionally unchanged because a Vercel image-transformation cost/pipeline decision is outside this release.

Large architectural follow-ups—splitting the homepage client boundary further, a Supabase/local derivative pipeline, and catalog-wide intrinsic dimension storage—remain outside this integration.

## Priorities

### P0 — release gates

- [x] crawl endpoints, canonicals, metadata, structured data, noindex, 308, 404;
- [x] hostile Host protection and Preview indexing protection;
- [x] Next.js 15.5.21 security patch;
- [ ] approved Draft PR Preview QA and Lighthouse gates;
- [ ] owner-approved production release;
- [ ] owner-approved Vercel `www` → apex permanent redirect.

### P1 — after production approval

- [ ] Google Search Console Domain property and sitemap submission;
- [ ] production Rich Results / selected canonical verification;
- [ ] production Core Web Vitals and LCP render-delay monitoring;
- [ ] verify cache invalidation for any future out-of-band importer;
- [ ] Supabase/local WebP/AVIF derivative and intrinsic-size pipeline.

### P2 — future architecture/content

- [ ] further homepage Server/Client boundary reduction if field data justifies it;
- [ ] sitemap index if the catalog grows beyond a single practical sitemap;
- [ ] verified official social profiles before `sameAs`;
- [ ] approved shipping/return data before related Offer schema;
- [ ] resolve remaining baseline ESLint warnings in dedicated runtime-reviewed changes.
