# Hooma SEO Main Integration Matrix

Baseline: `a7d28c49f36d3a283e675d9adbb77fe2877b49ee` (`origin/main`)

The old `codex/technical-seo-phase-2` branch is a read-only reference. Current `main` remains authoritative for storefront, auth, cart, checkout, payments, admin, publication rules, and database behavior.

| # | SEO requirement | Old reference | Current `main` implementation | Initial status | Runtime overlap | Risk | Integration method | Required test | Final status |
|---:|---|---|---|---|---|---|---|---|---|
| 1 | `robots.txt` | `1475f2e8:app/robots.ts` | Missing | Port required | Routing only | Low | Rebuild MetadataRoute rules for current private/API/auth routes | `/robots.txt` 200 and policy assertions | Integrated |
| 2 | Dynamic sitemap | `1475f2e8:app/sitemap.ts` | Missing; `storefront_product_cards` is current publication source | Port required | Catalog reads | Medium | Query current publication view and active root categories only | XML parse, no drafts/private/query URLs | Integrated with current publication view |
| 3 | Canonical host | `1475f2e8:lib/seo.ts` | Root metadata has no `metadataBase` or canonicals | Port required | Metadata only | Low | Fixed `https://hooma.ge` primitives and self-canonicals | Canonical assertions | Integrated |
| 4 | `/shop/[category]` | `1475f2e8:app/shop/[category]/page.tsx` | Query-based `/shop?category=` | Port required | Catalog UI/read | Medium | Thin canonical route reusing current Shop page | Known/unknown category and filtered noindex tests | Integrated without duplicating Shop UI |
| 5 | Unique home/category/product metadata | Phase 1 page changes | Global metadata repeated everywhere | Port required | Catalog reads | Medium | Static home/shop and cached dynamic category/product metadata | Three-product uniqueness tests | Integrated |
| 6 | Open Graph/Twitter | `lib/seo.ts`, page metadata | Missing | Port required | Metadata only | Low | Shared metadata builder; product hero image | OG/Twitter assertions | Integrated |
| 7 | `OnlineStore` | `fe710fe1:app/page.tsx` | Missing | Port required | Homepage markup | Low | Safe JSON-LD using verified Hooma identity/logo only | JSON parse/schema assertions | Integrated; unverified `sameAs` skipped |
| 8 | Product/Offer/BreadcrumbList | `fe710fe1:app/product/[slug]/page.tsx` | Missing; real price/SKU/image available | Port required | Product/catalog reads | Medium | Generate from current public Product and active variant; no fake ratings | JSON parse and real-value assertions | Integrated with real Product data |
| 9 | Private/search/filter noindex | Phase 1 layouts/pages | Mostly missing | Port required | Metadata only | Low | Route metadata and filtered shop canonical/noindex | Private/filter assertions | Integrated |
| 10 | Legacy product 308 | `1475f2e8:app/products/[slug]/page.tsx` | Existing redirect, currently 307 | Changed | Routing | Low | Use `permanentRedirect` without changing destination | 308 + path test | Integrated |
| 11 | Unknown product/category 404 | Phase 1 dynamic pages | Product 404 exists; category route missing | Partial | Catalog reads | Low | Preserve product `notFound`, add category `notFound` | Unknown route status | Integrated |
| 12 | Visible breadcrumbs | Phase 1 shop/product pages | Query-category breadcrumbs exist | Changed | UI links | Low | Preserve UI, switch category hrefs to canonical route | Browser/HTML link assertions | Integrated |
| 13 | Crawlable HTML links | Phase 1 Header/ProductCard | Product anchors exist; category links use queries | Partial | Storefront UI | Low | Convert stable category links to path URLs | Raw HTML anchor assertions | Integrated |
| 14 | Server-rendered homepage | `fe710fe1:HomeStorefront` | Current carousel/storefront is client boundary | Changed | Homepage UX/language | High | Preserve carousel/client architecture; optimize payload without wholesale replacement | Raw HTML + carousel/assistant regression | Current SSR output preserved; no risky rewrite |
| 15 | Homepage payload reduction | `fe710fe1:app/page.tsx` | 440,700-byte production HTML | Port required | Homepage catalog volume | Medium | Reduce per-section serialized cards while keeping every category shelf | Raw HTML target and visual smoke | Integrated: 12 → 6 cards/section |
| 16 | Image/media optimization | `fe710fe1:lib/catalog-media.ts` and image components | Responsive `next/image`; unoptimized source CDN | Partial | Product/gallery media | Medium | Keep current policy; add only safe source sizing and LCP hints where supported | image attributes/LCP inspection | Safe MakerWorld derivatives integrated |
| 17 | Catalog/product cache | `fe710fe1:lib/storefront-cache.ts` | Only invalidation tag exists; reads uncached | Port required | Public price display | High | Short TTL around current reads; search bypass; checkout remains uncached/authoritative | Cache/static tests + payment tests | Integrated for display reads only |
| 18 | Admin invalidation | Phase 2 cache tags | Current publish/audit/media/settings paths already call central invalidation | Changed | Admin mutations | Medium | Expand central tag fan-out; retain all current auth/role checks | Admin invariant/static tests | Integrated via current central invalidator |
| 19 | OG image route | `fe710fe1:app/opengraph-image/route.tsx` | Missing | Port required | Static route | Low | Node ImageResponse, PNG 1200×630, real logo | MIME/dimensions test | Integrated |
| 20 | ESLint | `fe710fe1:.eslintrc.json` | `next lint` prompts interactively | Port required | Tooling only | Low | Add current-compatible ESLint config/CLI without touching runtime semantics | Non-interactive lint | Integrated; 0 errors, baseline warnings tracked |
| 21 | SEO regression suite | `fe710fe1:scripts/seo-regression.mjs` | Missing | Port required | Test tooling | Low | Adapt to current route/code invariants, at least 10 checks | `test:seo` 10/10+ | Integrated: 12 read-only checks |
| 22 | Hostile Host redirect fix | `fe710fe1:lib/site-origin.ts` | Auth actions/callbacks trust request host headers | Port required | Auth redirects | High | Trusted deployment/config origin across current OAuth/email confirmation flows | Host-injection tests + auth suite | Integrated across current auth/email flows |
| 23 | Preview-only `X-Robots-Tag` | `fe710fe1:next.config.ts` | Missing | Port required | Preview headers only | Low | Vercel Preview conditional header | Preview header assertion | Integrated; Preview verification required |
| 24 | Next.js security patch | `fe710fe1:package.json` (`15.5.21`) | `15.5.20`; audit shows runtime advisories fixed in 15.5.21 | Port required | Framework runtime | High | Patch only Next.js and lockfile from current main | Full build/tests/audit | Integrated: Next.js 15.5.21 |
| 25 | Workspace-root configuration | `fe710fe1:next.config.ts` | Build/lint infer `/Users/georgedevdariani` from unrelated lockfile | Port required | Build tooling | Low | Explicit tracing/Turbopack root using current project | Warning absence in build | Integrated; warning removed |

## Baseline evidence

- TypeScript: pass.
- Production build: pass; homepage First Load JS 124 kB, product First Load JS 204 kB.
- Existing tests: 127/127 pass.
- ESLint: baseline failure because `next lint` opens the first-time configuration prompt.
- Dependency audit: 0 critical, 8 high, 7 moderate; Next.js 15.5.20 advisories require the scoped 15.5.21 patch.
- Production homepage HTML: 440,700 bytes.
- Production Lighthouse mobile median: Performance 97, LCP 2.547 s, CLS 0, TBT 9.5 ms.
