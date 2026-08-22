# Hooma SEO Main Integration Report

Date: 2026-08-16
Status: **ROLLED BACK / NOT LIVE. PR #85 was merged, but the exact Production artifact failed the mandatory real-data sitemap regression and Production was immediately restored to the recorded pre-release deployment. Section 15 is authoritative for the final release status.**

## 1. Source and branch state

- source of truth: `origin/main`;
- recorded approved base: `a7d28c49f36d3a283e675d9adbb77fe2877b49ee`;
- current fetched `origin/main`: `a72a7a861e4099725109407fa637bca135a15e32` — changed after the approved base;
- latest fetch: **stop condition**; no merge, rebase, cherry-pick, or push followed;
- branch: `codex/seo-integration-main`;
- local HEAD: `f6e532a1a742ba95213a9e7e4999f1d62be22af6`;
- remote branch: `origin/codex/seo-integration-main` at exact SHA `3688f8d8dbe0513492b3615898f68ad047d564e5`;
- current divergence: `origin/main` 2 commits ahead / local integration 7 commits ahead from merge-base `a7d28c49`; remote integration remains one commit behind local HEAD;
- sibling worktree: `/Users/georgedevdariani/Documents/ChatGPT/Hooma SEO Integration`;
- old dirty worktree remains unchanged: modified `.gitignore`, untracked `SEO_PHASE_3_PREVIEW_REPORT.md`.

The canonical harness and minimal category-hero LCP fixes were previously pushed by ordinary fast-forward to the existing integration branch and attached to Draft PR #85. The later QA-harness-only commit remains local because the required base SHA changed. No merge, rebase, cherry-pick, force-push, direct `main` push, migration, database mutation, production deploy, promotion, DNS, domain assignment, environment-variable change, or Search Console change was performed.

## 2. Integration commits

| Commit | Scope |
|---|---|
| `c39fbce1` | crawl, indexation, metadata foundations |
| `20d0af2b` | category/product metadata, schema, breadcrumbs, canonical links |
| `cd9eb5c9` | homepage payload, display cache, MakerWorld image sizing |
| `9c652bcd` | auth redirect hardening, Preview noindex, Next patch, ESLint/tests/docs |
| `b320d268` | canonical parser hardening and in-memory fixture coverage |
| `3688f8d8` | full-width category-hero `sizes`, initial-image priority contract, and targeted fixtures |
| `f6e532a1` | local-only browser release-gate readiness/session harness and server-render fixtures; not pushed |

## 3. Feature result

The full 25-item decision record is in `SEO_INTEGRATION_MATRIX.md`.

Ported/adapted to current `main`:

- robots and dynamic publication-aware sitemap;
- apex metadataBase, canonical/noindex policy, Georgian metadata, OG/Twitter;
- canonical category route, real 404, visible/crawlable breadcrumbs and anchors;
- dynamic product metadata and product hero sharing image;
- OnlineStore, Product/Offer/BreadcrumbList JSON-LD from real data;
- legacy product 308;
- 1200×630 OG image route;
- 6-card homepage payload limit, short display/sitemap caches, current admin invalidation fan-out;
- safe MakerWorld WebP/resize source URLs;
- hostile Host protection across current OAuth/signup/email-confirmation/email-change/middleware flows;
- Preview-only `X-Robots-Tag`;
- Next.js 15.5.21, workspace root, ESLint, and a 12-check SEO regression suite.

Intentionally skipped/deferred:

- `AggregateRating`, synthetic reviews, inventory quantity, shipping/returns, and social `sameAs` without approved real data;
- `images.unoptimized` policy change and a Supabase/local derivative pipeline;
- wholesale homepage/server-component rewrite that could regress the current carousel, language state, assistant, or Hooma+;
- domain redirect and Search Console actions pending owner approval.

## 4. Local gates

| Gate | Result |
|---|---|
| Node / pnpm | 24.19.0 / 11.19.0 |
| Next.js | patched 15.5.20 → 15.5.21 |
| TypeScript | pass (`tsc --noEmit`) |
| ESLint | pass: 0 errors, 11 warnings |
| Production build | pass; 36 generated pages; home First Load JS 124 kB; product 204 kB |
| Existing local tests after canonical fix | 144/144 pass, including 16 canonical fixtures |
| Local tests after hero browser-harness RCA | 151/151 pass; targeted hero/harness fixtures 12/12 pass |
| Canonical fixture matrix | 16/16 pass |
| Actual hero server-render fixture | pass: 11 slides/11 images; household active at index 0; exact eager/high/100vw/1774x887 contract |
| Browser harness fixtures | pass: semantic selector, exact-host bypass, mutation blocking, readiness/stability, 302 propagation, redacted diagnostics |
| Auth/hostile Host tests | 9/9 pass |
| Relevant cart/payment/storefront tests | 62/62 pass |
| `git diff --check` | pass |
| Migration gate | pass; zero diff from recorded base |
| Secret scan | pass; no env/OIDC/bypass/token/private key tracked |
| Latest pre-push fetch/divergence | **blocked:** `origin/main` advanced to `a72a7a86`; no push performed |
| Dependency audit | 0 critical, 5 high, 2 moderate |
| Real-data protected Preview SEO HTTP regression | pass: 12/12 on source SHA `3688f8d8`; isolated browser could not establish the category-hero DOM gate afterward — see sections 5 and 7 |

Build warning history: the earlier Preview reproduced Supabase JS's Edge Runtime `process.version` warning. The exact-`3688f8d8` Preview build completed successfully and that warning did **not** appear in its filtered build log; middleware compiled at 91.5 kB. The 11 existing lint warnings remained non-blocking.

The 11 lint warnings are pre-existing hook-dependency/admin-preview `<img>` warnings in CartContext, Header, GoogleMapLocationPicker, CatalogProductAuditConsole, HoomaProductForm, ProductMediaEditor, and HoomaAssistant. No lint error remains. They were not auto-fixed because several touch payment/cart or admin runtime semantics.

## 5. Git integration and protected Preview blocker

The required local HTTP suite must verify a category and three real products. The new worktree has no local Supabase environment. Read-only Vercel discovery confirmed:

- authenticated account: `mneloapp`;
- scope/project: `mnelo/hooma` (`prj_ZwRD6yZPQbRZCaV6oXTIoz0yIG7o`);
- Framework: Next.js; Root Directory: `.`; Node: 24.x.

The worktree was interactively linked to that existing project; no project was created and no settings changed. Vercel marks all Preview Supabase URL/publishable/service variables as `Sensitive`. `vercel env pull` returns non-usable hidden sentinels, `vercel env run` does not expose them, and Development has no project variables. `vercel dev` therefore served static SEO routes but had no catalog rows. Values were never printed.

The temporary Vercel OIDC `.env.local` and temporary diagnostic env directory were deleted after this check. The gitignored `.vercel/project.json` linkage remains. No credential is tracked.

The owner approved the sequence exception. The exact integration HEAD was pushed and a Draft PR was created:

- PR: [Mneloapp/Hooma #85](https://github.com/Mneloapp/Hooma/pull/85);
- base/head: `main` ← `codex/seo-integration-main`;
- PR head SHA at initial Preview creation: `9c652bcd838b74f36a7f5dec0d1d16f613055f30`;
- state: Draft; auto-merge is not configured (`autoMergeRequest: null`); repository auto-merge is disabled; the PR body explicitly blocks merge until Preview QA is complete.

The Git integration created the first Preview successfully:

- project: `mnelo/hooma` (`prj_ZwRD6yZPQbRZCaV6oXTIoz0yIG7o`);
- target/environment: `Preview`;
- source SHA: `9c652bcd838b74f36a7f5dec0d1d16f613055f30`;
- Preview URL: `https://hooma-nnggn0mg6-mnelo.vercel.app`;
- deployment ID: `dpl_z9Wcx41ZsyYYqsJxWN9yWCxKe9ww`;
- branch alias only: `https://hooma-git-codex-seo-integration-main-mnelo.vercel.app`;
- no `hooma.ge` or `www.hooma.ge` alias was assigned to the Preview.

Before starting the HTTP QA, `vercel curl` was used based on its authenticated-protection behavior. Vercel CLI 59.0.0 instead reported that no bypass existed and automatically generated a new Protection Bypass for Automation credential. This was not an authorized settings change under the current gate, so work stopped immediately after the first `HEAD /` request. That one response confirmed the exact Preview header `X-Robots-Tag: noindex, nofollow, noarchive`.

The automatically created credential was revoked using Vercel's project protection-bypass API without printing or storing its value. Post-cleanup verification shows:

- `protectionBypassCount: 0`;
- Vercel Authentication unchanged: `ssoProtection.deploymentType = all_except_custom_domains`;
- no password/protection scope/domain/environment setting was changed.

The owner then explicitly approved exactly one temporary automation bypass credential for read-only QA and Lighthouse. A guarded lifecycle enforced a 55-minute hard stop, exact-host header binding, `GET`/`HEAD`/`OPTIONS` only, mutation blocking, no query-string bypass, one active credential maximum, and cleanup on any failure.

The required preflight passed immediately before creation:

- `origin/main`: exact `a7d28c49f36d3a283e675d9adbb77fe2877b49ee`;
- branch/HEAD/remote branch: exact `codex/seo-integration-main` / `9c652bcd838b74f36a7f5dec0d1d16f613055f30`;
- Preview: exact host, deployment ID, Preview target, READY state, source SHA, branch alias only;
- Production: exact prior deployment `dpl_HHHWjfrS69tfdCGmUEapi5ytrkrx`;
- protection baseline: bypass count `0`, `all_except_custom_domains`.

Exactly one credential was created. Its value remained in process memory, was sent only as a request header to `hooma-nnggn0mg6-mnelo.vercel.app`, and was never printed, saved, passed in a command argument, included in a URL, committed, or copied to another origin. The active bypass count was exactly `1`.

The guarded HTTP regression then produced:

- check 1, robots policy: pass;
- check 2, real-data sitemap uniqueness/publication exclusions: pass;
- homepage: HTTP 200 and exact Preview `X-Robots-Tag` passed, but the HTML parser found no canonical link (`actual: empty`; expected `https://hooma.ge`).

This first error triggered the mandated stop. The credential was revoked immediately, before category/product/browser/Lighthouse execution. No second credential was created. Because the response body was intentionally not retained after the failure, this is a reproducible QA blocker rather than a final conclusion that the deployed page lacks canonical markup; a second protected fetch would require a new credential and is outside the approved one-credential limit.

### Local canonical root-cause analysis

No new protected request or credential was used for this analysis. The failure was a **parser/harness bug**, not an SEO metadata defect:

- the canonical check received the homepage `GET` response, not the earlier standalone `HEAD /` preflight response; the retained runtime window distinguishes 3 GET requests from the earlier 1 HEAD request;
- the request path awaited the full `response.text()` exactly once and passed that body to the canonical parser; there is no truncation or second `.text()` read;
- the parser scans every `<link>` tag in the complete HTML string, not only `<head>`, so a canonical emitted in `<body>` by Next.js streamed metadata is supported and is covered by a passing fixture;
- the one-off guarded QA harness copied the attribute parser with an over-escaped character class. Its runtime regex treated `\\w` as literal backslash/`w` content instead of the `\w` word-character class, so every normal `rel`/`href` attribute map was empty and the canonical result was always empty;
- the committed `scripts/seo-regression.mjs` had the correct one-backslash attribute regex. It did, however, compare raw canonical strings, return only the first match, and did not explicitly reject empty/duplicate/query/hash canonicals. The local fix closes those harness gaps and makes the functions importable for fixtures;
- the failed HTTP response was storefront HTML, not Vercel's protection interstitial: it returned HTTP 200 with the app's exact Preview header `noindex, nofollow, noarchive`; after revocation, the unauthenticated protection response was separately observed as HTTP 302 with the Vercel challenge behavior;
- source and the new production build both retain `metadataBase = https://hooma.ge` and homepage `alternates.canonical = absoluteUrl("/")`. The compiled page contains `alternates:{canonical:absoluteUrl("/")}` and the compiled helper contains `https://hooma.ge`;
- Preview does not rewrite canonical to its deployment hostname. Preview indexing protection remains independently implemented by `X-Robots-Tag` in `next.config.ts`;
- root layout metadata does not define `alternates`; homepage metadata defines it directly, so child-metadata shallow merge cannot remove the homepage canonical;
- no `htmlLimitedBots` override or runtime streaming behavior change was added.

The discarded protected response body means the exact physical placement of its canonical tag cannot be re-observed without a forbidden second protected fetch. That placement is not causal: the parser consumes the complete response and the streamed-`<body>` fixture passes.

Fixture coverage and result:

- canonical first/last within `rel`, `rel`/`href` attribute order, single/double quotes, multiline/self-closing form, whitespace and extra attributes;
- canonical in `<head>` and streamed-metadata-style `<body>`;
- missing, empty, duplicate, Preview-host, query, and hash rejection;
- URL normalization verifies exactly `https://hooma.ge/`.

Result: **16/16 pass**. The fix is commit `b320d268969f67a07652f63f35f0eb9c078f0382`. It was subsequently fast-forward pushed and validated on a new Git-connected Preview as recorded below.

Post-error cleanup and verification passed:

- `protectionBypassCount: 0`;
- unauthenticated Preview again returns the Vercel Authentication `302` challenge;
- protection mode remains `all_except_custom_domains`;
- the isolated Chrome profile and temporary harness were removed;
- repository secret scan found no bypass header/token/private-key material;
- Production remains on the exact prior deployment.

### New-SHA Preview rerun and browser release-gate failure

Before the push, `git fetch origin --prune` and the required ancestry/scope checks passed: `origin/main` was unchanged; the local branch/HEAD were exact; the old remote branch was `9c652bcd838b74f36a7f5dec0d1d16f613055f30`; `b320d268969f67a07652f63f35f0eb9c078f0382` was its direct descendant; and the new commit contained only `scripts/seo-regression.mjs` and `tools/seo-canonical-parser.test.mjs`. `SEO_MAIN_INTEGRATION_REPORT.md` remained untracked. The ordinary fast-forward push advanced only `codex/seo-integration-main`.

PR #85 remained OPEN and Draft with `autoMergeRequest: null`, a CLEAN merge state, and successful GitHub/Vercel checks. The new Git-connected deployment reached Ready:

- project: `mnelo/hooma` (`prj_ZwRD6yZPQbRZCaV6oXTIoz0yIG7o`);
- target: Preview;
- source SHA: `b320d268969f67a07652f63f35f0eb9c078f0382`;
- Preview URL: `https://hooma-o03k0yngc-mnelo.vercel.app`;
- deployment ID: `dpl_5Jj68KUbKxDGczh8nQ8ZysYmNxys`;
- only branch alias: `https://hooma-git-codex-seo-integration-main-mnelo.vercel.app`;
- no `hooma.ge` or `www.hooma.ge` alias;
- build: successful on Next.js 15.5.21, 36 generated pages, homepage First Load JS 124 kB, product First Load JS 204 kB;
- the existing Supabase Edge Runtime `process.version` warning and 11 existing lint warnings reproduced without a build error.

After exact deployment/source/Production/protection validation, the owner-authorized single temporary credential was created. Active bypass count never exceeded `1`. Its value stayed in process memory and was host-bound only to `hooma-o03k0yngc-mnelo.vercel.app`; it was not placed in a URL, output, shell argument/history, log, HAR, screenshot, file, Git, report, custom domain request, or Supabase request. The isolated browser profile and guarded harness allowed only `GET`, `HEAD`, and required `OPTIONS`; mutation-capable methods were blocked.

The committed fixed parser was imported directly by the regression suite. The new Preview regression restarted from check 1 and passed **12/12**:

1. robots policy: pass;
2. real-data sitemap uniqueness and publication exclusions: pass;
3. homepage metadata, canonical/link/size policy, and OnlineStore JSON-LD: pass;
4. category metadata, BreadcrumbList, and ordinary product anchors: pass;
5. three real products with unique metadata and Product/Offer/BreadcrumbList JSON-LD: pass;
6. search/filter noindex and canonical policy: pass;
7. cart/checkout/login noindex policy: pass;
8. legacy 308 and unknown product/category 404: pass;
9. 1200x630 OG route: pass;
10. hostile Host redirect protection: pass;
11. exact Preview `X-Robots-Tag: noindex, nofollow, noarchive`: pass;
12. live `www` redirect: intentionally deferred by the approved regression configuration.

Real-data samples were category `/shop/3d-printer` and products `true-spring-3037752`, `bambu-lab-p2s-3039863`, and `ptfe-ams-1-ams-2-pro-3047971`. Homepage canonical normalized to exactly `https://hooma.ge/`, with no query or hash. The harness did not retain the tag's physical `<head>`/streamed-`<body>` location in the failure payload; after credential revocation no extra protected request was made to recover that non-gating diagnostic.

Browser QA then found `/homepage/household-category-hero.webp`, but the real rendered image had `sizes=""` rather than the required responsive value `100vw`. This was a release-gate failure: remaining browser navigation, console completion, product-to-client-local-cart-to-checkout gate, and Lighthouse were stopped immediately. No Lighthouse result or median is inferred. The credential was revoked at once; no additional credential was created.

Deployment-specific runtime logs for the QA window contain 29 requests, all `GET`: 24 HTTP 200, two 307, one 308, and two 404. Mutation-capable methods: `0`; runtime fatal/error: `0`; HTTP 5xx: `0`. Browser console QA was not completed because the responsive-image release gate stopped the run before the full browser sequence.

Post-failure cleanup was independently verified before this report was updated:

- credential revoked successfully; `protectionBypassCount: 0`;
- unauthenticated Preview again returns the Vercel Authentication 302 challenge;
- protection mode remains `all_except_custom_domains`;
- isolated browser closed; temporary browser profile, controller, header/cookie/token material, and harness removed;
- repository secret scan passed;
- database/order/payment/refund/cancellation/account/admin mutation count: `0`;
- Production remains Ready on `dpl_HHHWjfrS69tfdCGmUEapi5ytrkrx`.

### Exact-SHA hero-fix Preview and third credential result

The approved preflight passed before the next push: `origin/main` was still exact `a7d28c49f36d3a283e675d9adbb77fe2877b49ee`; local HEAD was `3688f8d8dbe0513492b3615898f68ad047d564e5`; the remote integration branch was `b320d268969f67a07652f63f35f0eb9c078f0382`; the new commit was its direct descendant; and the commit contained only `components/home/HomeCategoryHero.tsx`, `tools/home-category-hero-lcp.test.mjs`, and `tools/storefront-home-rules.test.mjs`. The report remained untracked. An ordinary fast-forward advanced only `codex/seo-integration-main`.

PR #85 remained OPEN and Draft, with `autoMergeRequest: null`, CLEAN merge state, and successful Vercel/Vercel Preview Comments checks. The exact-source Git-connected deployment reached Ready:

- project: `mnelo/hooma` (`prj_ZwRD6yZPQbRZCaV6oXTIoz0yIG7o`);
- target: Preview;
- source SHA: `3688f8d8dbe0513492b3615898f68ad047d564e5`;
- Preview URL: `https://hooma-3occ7o8uw-mnelo.vercel.app`;
- deployment ID: `dpl_AG9YSpit8gaaF8AiMvfpPgkgD9EY`;
- branch alias only: `https://hooma-git-codex-seo-integration-main-mnelo.vercel.app`;
- no `hooma.ge` or `www.hooma.ge` alias;
- build: successful on Next.js 15.5.21 in 49 seconds, 36 generated pages, homepage First Load JS 124 kB, product First Load JS 204 kB, middleware 91.5 kB;
- the 11 existing lint warnings remained; the earlier Supabase Edge Runtime `process.version` warning was not reproduced in the filtered build log.

After exact deployment/source/Production/protection validation, exactly one owner-authorized third temporary credential was created. Active count was exactly `1`, never higher. A 55-minute watchdog was used. The value remained in memory, was sent only as a host-bound header/cookie to `hooma-3occ7o8uw-mnelo.vercel.app`, and was not placed in a query string, command argument/history, output, debug log, HAR, screenshot, file, Git, report, custom-domain request, or Supabase request. The isolated browser and HTTP guard permitted only `GET`, `HEAD`, and required `OPTIONS`; mutation-capable methods and Server Action/API writes were blocked.

The committed fixed canonical parser was imported directly. The HTTP regression restarted from check 1 and passed **12/12**:

1. robots policy: pass;
2. real-data sitemap uniqueness/publication exclusions: pass;
3. homepage metadata, canonical, ordinary links, payload-size rule, and OnlineStore JSON-LD: pass;
4. category metadata, BreadcrumbList, and ordinary product anchors: pass;
5. three real products with unique metadata and Product/Offer/BreadcrumbList JSON-LD: pass;
6. search/filter noindex and canonical policy: pass;
7. cart/checkout/login noindex policy: pass;
8. legacy 308 and unknown product/category 404: pass;
9. 1200x630 OG route: pass;
10. hostile Host redirect protection: pass;
11. exact Preview `X-Robots-Tag: noindex, nofollow, noarchive`: pass;
12. live `www` redirect: intentionally deferred by the approved regression configuration.

The real-data sample was category `/shop/3d-printer` and products `true-spring-3037752`, `bambu-lab-p2s-3039863`, and `ptfe-ams-1-ams-2-pro-3047971`. Supabase-backed catalog reads succeeded. Homepage canonical normalized to exactly `https://hooma.ge/` with no query or hash.

The isolated-browser release gate then stopped at its first category-hero DOM assertion with the exact error **`category hero slides were not rendered`**. The query returned fewer category-hero image nodes than the gate required, so runtime verification of `sizes="100vw"`, initial `loading="eager"`, `fetchpriority="high"`, deferred-slide lazy loading, dimensions, the single preload/transfer, image content type, responsive layout box, CLS, console, cart-to-checkout login gate, and runtime 5xx could not continue. The local component/build contract still contains eleven hero `<img>` elements, with only the initial slide eager/high-priority, but that is not a substitute for Preview browser evidence. The stopped session did not retain enough non-secret page material to distinguish an application render failure from a protected-browser session/interstitial setup failure, and the credential limit prohibits a new protected request for diagnosis.

This was a release-gate failure. The controller stopped immediately, Lighthouse was **not run**, and the third credential was revoked before report preparation. No fourth credential was created. Cleanup evidence:

- revocation succeeded; `protectionBypassCount: 0` was independently reconfirmed through a filtered read-only Vercel API response;
- unauthenticated Preview again returned the Vercel Authentication `302` challenge;
- protection mode remained exact `all_except_custom_domains`;
- temporary browser profile, controller, header/cookie/token material, and harness were removed (`profilesRemaining: 0` and the controller path is absent);
- Production remained Ready on exact `dpl_HHHWjfrS69tfdCGmUEapi5ytrkrx`, with the same `hooma.ge` and `www.hooma.ge` aliases;
- mutation-capable HTTP methods, Server Action/API writes, login/OAuth/account/admin actions, orders, payments, refunds, cancellations, and database writes: `0`.

The final `git fetch origin --prune` again confirmed `origin/main` at exact `a7d28c49f36d3a283e675d9adbb77fe2877b49ee`; the result is not provisional.

### Local hero-render and browser-harness root-cause analysis

No fourth credential, protected Preview request, deployment, push, PR update, Vercel setting change, Supabase request, or database/Production action was used. Analysis was limited to source, existing build artifacts, local fixtures, and the surviving report diagnostics.

The application render path is valid:

- `app/page.tsx` maps real product data only into `categoryProducts` and passes it to `HomeStorefrontClient`;
- `HomeStorefrontClient` renders `<HomeCategoryHero />` unconditionally before its product-shelf category loop;
- `HomeCategoryHero` owns a static 11-item `categoryPosters` array and calls `categoryPosters.map` without any product-data or category filtering;
- the household poster is the first item and `useState(0)` makes it the initial active slide;
- all slides are emitted during React server rendering; none depends on `useEffect`, ResizeObserver, scrolling, visibility, or hydration to enter the DOM;
- the existing `.next` server/client build artifacts also contain all 11 poster definitions and the native `<img>` contract.

An actual component fixture transpiles and server-renders the current `HomeCategoryHero` with mocked language/link/icon dependencies. It produces 11 slides and 11 native images. The first household slide has `aria-hidden="false"`; the remaining ten have `aria-hidden="true"` but remain in the DOM. `/homepage/household-category-hero.webp` renders with exact `sizes="100vw"`, `loading="eager"`, `fetchpriority="high"`, `width="1774"`, and `height="887"`; every deferred hero is lazy/auto. React server output emits one household image preload. This rules out application data, filtering, initial-state, hydration-only, and visibility bugs.

The exact proven root cause is therefore a **browser QA harness readiness/diagnostic defect**, not an application render bug. The disposable controller source had been removed by the mandated secret/profile cleanup, and its surviving failure payload records only `category hero slides were not rendered`. It did not retain final URL/status/title/readiness/body length, image pathnames, category counts, same-origin asset statuses, console summary, or error-boundary state. The selector assertion ran before those session conditions were established. Consequently that old payload conflates three harness subcauses — a stale selector, a too-early query, or JS/CSS/RSC protection propagation — and cannot honestly distinguish among them after cleanup. Claiming one of those three as the remote cause would exceed the available evidence. The defect that made the release gate fail without a diagnosis is exact and reproducible: **selector execution was not preceded by an explicit session-readiness gate and its failure payload was under-specified**.

The repository QA harness is now hardened without changing application code or adding a `data-testid`:

- the hero selector uses the native image's `currentSrc`/`src` pathname plus the containing `/shop/household` link, with no dependency on a Next Image wrapper or `data-nimg`;
- the session gate requires a successful initial document, the exact Preview hostname, no protection/interstitial page, `document.readyState = complete`, an observed/successful same-origin Next JavaScript bundle, zero same-origin JS/CSS/RSC 302 challenges, and three stable DOM samples;
- same-origin response recording separates document, JavaScript, CSS, and RSC status counts;
- future bypass setup attaches the in-memory header only to the exact HTTPS Preview hostname on every allowed same-origin request and asks the initial document to set the bypass cookie with `x-vercel-set-bypass-cookie: true`;
- only `GET`, `HEAD`, and `OPTIONS` are allowed; every other method is aborted before it can reach any origin;
- cookie inspection returns only name/domain/secure metadata;
- safe failure diagnostics contain only final URL/status, title, readyState, body length, `/homepage/` image pathnames, selector count, same-origin status summary, console summary, Next error-boundary boolean, and category link/slide counts. Full HTML, headers, cookies, values, and credentials are excluded.

Local verification after the harness change:

- targeted actual-hero and browser-harness fixtures: 12/12 pass;
- complete local suite: 151/151 pass;
- TypeScript: pass;
- ESLint: pass with 0 errors and the same 11 existing warnings;
- production build: pass on Next.js 15.5.21; 36 pages; homepage 124 kB; product 204 kB; middleware 91.4 kB;
- `git diff --check`: pass;
- secret scan: pass.

Changed QA/report files only: `tools/seo-browser-release-gate.mjs` (new), `tools/seo-browser-release-gate.test.mjs` (new), `tools/home-category-hero-lcp.test.mjs` (fixture expansion), and this uncommitted report. No application component/config/data file changed. The three QA files were committed locally as `f6e532a1a742ba95213a9e7e4999f1d62be22af6`; this report remains uncommitted.

The prior conclusion that the existing application Preview could be reused was superseded by the owner's requirement for a new exact-source Git-connected Preview containing the committed harness. That new Preview was not created because the mandatory pre-push base check failed.

### QA-harness commit and pre-push main-drift blocker

Before commit, the requested checks were rerun and passed: targeted hero/browser fixtures 12/12, full tests 151/151, TypeScript, ESLint with 0 errors and the same 11 warnings, production build with 36 pages, `git diff --check`, and secret scan. Commit `f6e532a1a742ba95213a9e7e4999f1d62be22af6` contains exactly:

- `tools/seo-browser-release-gate.mjs`;
- `tools/seo-browser-release-gate.test.mjs`;
- `tools/home-category-hero-lcp.test.mjs`.

`SEO_MAIN_INTEGRATION_REPORT.md` remained untracked and was not committed. No application/runtime file is in the commit; its parent is exact prior remote HEAD `3688f8d8dbe0513492b3615898f68ad047d564e5`.

The immediately following `git fetch origin --prune` changed `origin/main` from the approved `a7d28c49f36d3a283e675d9adbb77fe2877b49ee` to `a72a7a861e4099725109407fa637bca135a15e32`. The approved base remains the merge-base, while current `origin/main` is two commits ahead and local integration is seven commits ahead. This violated the mandatory exact-base precondition, so work stopped without push. Remote `origin/codex/seo-integration-main` remains `3688f8d8dbe0513492b3615898f68ad047d564e5`.

Consequences of the stop:

- PR #85 was not updated;
- no Git-connected Preview for `f6e532a1` was created or awaited;
- no manual deployment was run;
- no fourth bypass credential was created;
- no protected Preview request, browser regression, Lighthouse run, Vercel setting change, or database/network QA action occurred.

Owner direction is required before reconciling the two new `main` commits. No rebase, merge, or cherry-pick has been attempted.

## 6. Dependency/security findings

| Package | Dependency path | Finding | Runtime reachability / applicability | Fixed version | Blocker |
|---|---|---|---|---|---|
| `sharp@0.34.5` | `. > next > sharp` | GHSA-f88m-g3jw-g9cj, inherited libvips CVEs | optional; Hooma uses `images.unoptimized: true`; no attacker-controlled sharp endpoint; OG uses trusted local input | `>=0.35.0` | No |
| `postcss@8.4.31` | `. > next > postcss` | GHSA-6g55-p6wh-862q, source-map file disclosure | framework build dependency; no runtime/user-supplied CSS processing | `>=8.5.12` (use a compatible release including later fixes) | No |
| `postcss@8.4.31` / `8.5.16` | Next and direct Tailwind/autoprefixer paths | GHSA-r28c-9q8g-f849, source-map path traversal | trusted repository CSS at build time; no runtime CSS ingestion | `>=8.5.18` | No |
| `postcss@8.4.31` / `8.5.16` | Next and direct Tailwind/autoprefixer paths | GHSA-fxqj-rqcc-2cmp, incomplete source-map fix | same build-only path; attacker-controlled source maps absent | `>=8.5.23` | No |
| `postcss@8.4.31` | `. > next > postcss` | GHSA-qx2v-qp2m-jg93, CSS stringify XSS | build-time trusted CSS; Hooma does not stringify user CSS at runtime | `>=8.5.10` (prefer `>=8.5.23`) | No |
| `nanoid@3.3.15` | Next/direct PostCSS paths | GHSA-28wg-ghj8-5hjv, negative-size non-secure generator loop | transitive build tooling; Hooma does not call custom Nano ID generators | `>=3.3.16` | No |
| `nanoid@3.3.15` | Next/direct PostCSS paths | GHSA-2v37-7h3g-55p8, zero-size custom generator loop | transitive build tooling; trigger is absent | `>=3.3.18` | No |

The two Next.js 15.5.20 runtime advisories seen at baseline were removed by the scoped 15.5.21 patch. No unrelated dependency was upgraded. Remaining findings should be resolved through a tested compatible Next/Tailwind dependency update, not unsafe lockfile overrides.

## 7. Preview and Lighthouse

The exact-`3688f8d8` Git-connected Preview and fresh 12/12 HTTP regression passed. The isolated-browser category-hero DOM gate then failed before attribute/network/console/runtime/cart assertions, so the third authorized credential was revoked and Lighthouse was not run.

| Check | Result |
|---|---|
| Draft PR | created: [#85](https://github.com/Mneloapp/Hooma/pull/85), still Draft and unmerged |
| Remote integration HEAD | exact `3688f8d8dbe0513492b3615898f68ad047d564e5` |
| Local QA-harness HEAD | `f6e532a1a742ba95213a9e7e4999f1d62be22af6`; not pushed because `origin/main` changed |
| Preview deployment | Ready: `https://hooma-3occ7o8uw-mnelo.vercel.app` / `dpl_AG9YSpit8gaaF8AiMvfpPgkgD9EY` |
| Project / target / source | `mnelo/hooma` / Preview / exact `3688f8d8dbe0513492b3615898f68ad047d564e5` |
| Preview live-domain alias | pass: none |
| Preview noindex header | pass during authenticated QA: exact `noindex, nofollow, noarchive`; after revocation the unauthenticated URL returns the Vercel `302` challenge with `X-Robots-Tag: noindex` |
| Production noindex header | pass: `https://hooma.ge/` returned no `X-Robots-Tag` |
| Sensitive Preview env | available to the Preview runtime; no value was read, printed, copied, stored, or placed in the harness; real-data catalog reads succeeded |
| Build logs | Ready; build completed in 49 seconds; no build error; earlier Supabase Edge Runtime `process.version` warning not reproduced in filtered log; existing 11 lint warnings reproduced |
| Runtime/5xx logs for this stopped browser gate | not reached; no result is inferred after the mandated stop |
| 12/12 regression | pass from check 1 on the new Preview |
| Three tested product slugs | `true-spring-3037752`; `bambu-lab-p2s-3039863`; `ptfe-ams-1-ams-2-pro-3047971` |
| Canonical | pass: normalized exact `https://hooma.ge/`; no query/hash |
| Browser console | incomplete — category-hero DOM assertion stopped the isolated-browser sequence before console QA completion |
| Cart → checkout login gate | not reached in browser; HTTP private-route/noindex regression passed |
| LCP hero browser check | **fail:** `category hero slides were not rendered`; Preview runtime attributes, preload/transfer, image response, viewport layout, and CLS were not measured |
| Hero source/build expectation | `sizes="100vw"`; initial `loading="eager"` and `fetchPriority="high"`; remaining slides lazy/auto; `1774×887`; no `srcset` because global `images.unoptimized` remains unchanged |
| Local root-cause classification | application render/visibility/filtering bug ruled out; browser harness lacked a prerequisite readiness/session gate and safe discriminating diagnostics |
| New exact-source Preview | not created; mandatory pre-push base check failed and manual deployment is prohibited |
| Lighthouse runs 1–3 and median | **not run**, as required after the browser release-gate failure |
| Production deployment/promotion | not performed |

Production remains unchanged after the push and Preview creation:

- live deployment ID: `dpl_HHHWjfrS69tfdCGmUEapi5ytrkrx`;
- target/status: Production / Ready;
- deployment URL: `https://hooma-1uehomexi-mnelo.vercel.app`;
- aliases still include `https://hooma.ge` and `https://www.hooma.ge` on that same prior deployment.

The final fetch after the stop condition confirmed `origin/main` is still exactly `a7d28c49f36d3a283e675d9adbb77fe2877b49ee`; results are not marked provisional.

Production baseline retained for later comparison: mobile Lighthouse median Performance 97, LCP 2.547 s, CLS 0, TBT 9.5 ms; production homepage raw HTML 440,700 bytes.

## 8. Runtime invariants

Code/tests confirm no integration changes to BOG order/payment semantics, authoritative `resolve_catalog_price`, cart isolation/recovery, cancellation/refund ledger, Hooma+, storefront assistant, catalog audit/publication permissions, or Supabase schema. Display caches are isolated from checkout price resolution. The real Preview read path and SEO HTTP regression passed; the browser harness defect is fixed locally, but push and the browser/Lighthouse rerun are blocked by the changed `origin/main` base.

No order, payment, refund, cancellation, account/admin operation, price/product mutation, seed/reset, migration, cache invalidation, or production database write was performed. The third credential lifecycle permitted only `GET`, `HEAD`, and required `OPTIONS`, blocked mutation-capable methods/Server Actions, and stopped on the first browser DOM failure before cart or account interaction. Database/order/payment/refund/cancellation mutation count is `0` by the executed-action and method-control inventory. Runtime fatal/5xx and full console results are deliberately reported as not reached, rather than inferred.

## 9. Complete changed-file list

```text
.eslintignore
.eslintrc.json
.gitignore
MANUAL_SEO_STEPS.md
SEO_AUDIT.md
SEO_INTEGRATION_MATRIX.md
SEO_REGRESSION_TESTS.md
SEO_RELEASE_CHECKLIST.md
app/about/layout.tsx
app/account/layout.tsx
app/account/settings/actions.ts
app/admin/layout.tsx
app/auth/actions.ts
app/auth/callback/route.ts
app/auth/complete/route.ts
app/auth/confirm/route.ts
app/auth/email-change/confirm/route.ts
app/cart/layout.tsx
app/checkout/page.tsx
app/contact/layout.tsx
app/faq/layout.tsx
app/hooma-plus/layout.tsx
app/how-it-works/layout.tsx
app/layout.tsx
app/login/page.tsx
app/notifications/layout.tsx
app/opengraph-image/route.tsx
app/page.tsx
app/privacy/page.tsx
app/product/[slug]/page.tsx
app/products/[slug]/page.tsx
app/robots.ts
app/shop/[category]/page.tsx
app/shop/page.tsx
app/signup/page.tsx
app/sitemap.ts
app/terms/page.tsx
components/Header.tsx
components/JsonLd.tsx
components/ProductCard.tsx
components/ProductImageGallery.tsx
components/home/HomeCategoryHero.tsx
components/home/HomeProductCard.tsx
components/home/HomeStorefrontClient.tsx
lib/catalog-media.ts
lib/seo.ts
lib/site-origin.ts
lib/storefront-cache.ts
lib/storefront-catalog.ts
middleware.ts
next.config.ts
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
scripts/seo-regression.mjs
tools/account-settings-rules.test.mjs
tools/auth-confirmation-rules.test.mjs
tools/home-category-hero-lcp.test.mjs
tools/seo-browser-release-gate.mjs
tools/seo-browser-release-gate.test.mjs
tools/seo-canonical-parser.test.mjs
tools/storefront-home-rules.test.mjs
```

This report is intentionally uncommitted.

## 10. Updated-main local merge and post-merge verification — 2026-08-15

This section supersedes earlier local-HEAD and Production-baseline statements where they differ. It records only the newly authorized local merge and local verification. No push, PR update, Preview, credential, Vercel mutation, Production request, OAuth exchange, cron invocation, social publish, or database write was performed.

### Merge preflight and result

Preflight passed after `git fetch origin --prune`:

- branch: `codex/seo-integration-main`;
- local HEAD: `f6e532a1a742ba95213a9e7e4999f1d62be22af6`;
- remote integration branch: `3688f8d8dbe0513492b3615898f68ad047d564e5`;
- `origin/main`: `a72a7a861e4099725109407fa637bca135a15e32`;
- old base `a7d28c49f36d3a283e675d9adbb77fe2877b49ee` remained an ancestor of updated main;
- tracked and staged worktree changes: 0;
- the only uncommitted paths were untracked `SEO_MAIN_INTEGRATION_REPORT.md` and `SEO_MAIN_ADVANCE_ASSESSMENT.md`; neither path existed in HEAD or incoming main.

The ordinary `git merge --no-edit origin/main` completed with the `ort` strategy and no conflict:

| Item | Result |
|---|---|
| Merge commit | `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c` |
| First parent | `f6e532a1a742ba95213a9e7e4999f1d62be22af6` |
| Second parent | `a72a7a861e4099725109407fa637bca135a15e32` |
| Conflict count | 0 |
| Unmerged index entries | 0 |
| Incoming merge stat | 30 files, +6,470 / -6 |

No rebase, cherry-pick, squash, custom merge strategy, history rewrite, reset, stash, or branch switch was used.

### `package.json` and frozen-lockfile semantic gate

The sole overlapping file, `package.json`, auto-merged correctly and was then inspected semantically:

- 18 unique scripts; duplicate script names: 0;
- all 16 first-parent scripts and all 16 updated-main scripts are represented; missing union entries: 0;
- Instagram script retained: `test:social:instagram`;
- TikTok/refresh script retained: `test:social:tiktok`;
- SEO scripts retained: `typecheck`, `test:seo`, and `lint = eslint .`;
- browser/canonical/hero QA files remain present;
- dependency union loss: 0;
- Next.js remains exactly `15.5.21`, with matching `eslint-config-next`;
- package manager declaration remains absent, as on both parents;
- `pnpm-workspace.yaml` was not changed by the merge;
- `pnpm-lock.yaml` was not changed by the merge.

`pnpm install --frozen-lockfile --offline --ignore-scripts` passed: lockfile up to date, resolution skipped, no lockfile regeneration required.

All 20 required social/cron environment names are present in `.env.example`. The Instagram/TikTok config, routes, providers, token encryption/refresh code, admin settings integration, cron route, and `vercel.json` cron are byte-identical to `origin/main` except for the intentionally union-merged `package.json`.

### Migration gate

| Check | Result |
|---|---|
| Migration count | 69 |
| `20260815000100_social_publishing_automation.sql` vs `origin/main` | exact match |
| Entire migration directory vs `origin/main` | 0 changed paths |
| Historical migration changes | 0 |
| Duplicate timestamps | 0 |
| Duplicate names | 0 |
| SEO-specific migrations | 0 |

### Local verification results

| Check | Result |
|---|---|
| Canonical + hero + browser targeted fixtures | 28/28 pass |
| Complete legacy/integration MJS suite | 156/156 pass |
| Instagram provider suite | 10/10 pass |
| TikTok OAuth/organic/refresh suite | 24/24 pass |
| Unique local fixture/unit tests | 190/190 pass |
| TypeScript (`tsc --noEmit`) | pass |
| ESLint | pass with 0 errors and 11 pre-existing warnings |
| Production build | pass on Next.js 15.5.21; 36 static pages generated |
| Frozen lockfile | pass, offline and unchanged |
| `git diff --check` | pass for merge delta, integration delta, and worktree |
| Secrets scan | pass; no credential signatures, private keys, tracked `.vercel` files, or non-empty secret placeholders |
| Dependency audit | completed; 0 critical, 5 high, 2 moderate; no package was changed |
| Migration comparison | pass |
| Local real-data `test:seo` | **environment-blocked/fail:** local sitemap contained only its 10 static URLs because this worktree has no local Supabase environment; assertion requires public catalog URLs |

The production build includes `/robots.txt`, `/sitemap.xml`, `/opengraph-image`, both product route forms, category routes, BOG callbacks, the social-token cron, and all four social OAuth routes. Homepage first-load output remains 124 kB; product output remains 204 kB; middleware remains 91.4 kB.

The local `test:seo` failure is not a merge/content regression proven by this run: `.env.example` is the only root environment file, so no Supabase-backed catalog category/product rows were available to the local server. The generated sitemap had exactly 10 valid static URLs and no dynamic catalog entries; the test stops at `sitemap must include public catalog URLs`. No Production or protected Preview URL was substituted, and no secret/environment pull was attempted. Consequently the real-data HTTP regression is not green and must be rerun later in an approved environment with read-only catalog credentials.

Dependency audit findings remain the known transitive set:

- high: `sharp` via Next.js (four inherited libvips CVEs; fixed in `sharp >=0.35.0`);
- high: two PostCSS file-read/path-traversal advisories;
- high: two `nanoid` generator-loop advisories;
- moderate: two PostCSS XSS/incomplete-source-map-fix advisories.

No automated dependency update was made.

### Runtime invariant and preservation checklist

Static contracts, merge comparisons, build output, and the passing unit suites confirm preservation of:

- Instagram OAuth routes/config/provider/tests;
- TikTok OAuth and fail-closed organic publishing routes/config/provider/tests;
- cron authentication and the exact Vercel schedule;
- social publishing schema and service-role/RLS contract;
- BOG checkout, callback, authoritative payment handling, and reconciliation;
- cart isolation, generation-bound recovery, and payment settlement behavior;
- customer auth, email confirmation/change, and Host-header-independent redirects;
- cancellation/refund ledger and signature-authoritative finality;
- Hooma+ payment/delivery behavior;
- storefront assistant rules;
- homepage carousel/category hero and 11-slide server-render contract;
- catalog publication/audit gates and admin permissions;
- SEO metadata, apex canonical, sitemap/robots, private-page noindex, JSON-LD, OG route, and legacy redirect code;
- Preview-only `X-Robots-Tag` gated by `VERCEL_ENV === "preview"`;
- Host-header protection via `trustedSiteOrigin`;
- hero `sizes="100vw"`, eager/high-priority initial image, deferred-slide behavior, dimensions, and single preload fixtures;
- canonical, hero, and browser regression tooling.

Instagram/TikTok/cron verification was static or mocked only. Real OAuth, provider token exchange/refresh, cron request, publish request, and social/database mutation counts are all 0.

### Post-merge semantic comparison

- merge result versus `origin/main`: 62 integration-specific files, +5,073 / -265;
- incoming-main set: 30 files;
- integration set from the old base: 62 files;
- exact overlap: only `package.json`;
- non-overlapping integration paths changed/lost during merge: 0;
- non-overlapping incoming-main paths changed/lost during merge: 0;
- lost or superseded intended changes: 0;
- runtime-sensitive exact textual conflicts: 0.

The integration-specific changed-file list remains the 62-path list in section 9. The merge adds the 30 incoming social/admin/config/schema paths listed in `SEO_MAIN_ADVANCE_ASSESSMENT.md`; it does not replace any integration-only file.

### Safety and freshness

- tracked worktree after verification: clean;
- uncommitted files: only the two requested reports;
- push count: 0;
- PR update count: 0;
- Preview/deployment count: 0;
- credential count: 0;
- Production/Vercel setting/domain/environment mutation count: 0;
- OAuth/social/cron action count: 0;
- DB/order/payment/refund/cancellation mutation count: 0.

Final fetch at 2026-08-15 23:10:14 +04:00 confirmed `origin/main = a72a7a861e4099725109407fa637bca135a15e32`; unchanged. Remote integration remains `3688f8d8dbe0513492b3615898f68ad047d564e5`. The merge result is current, not stale/provisional.

## 11. Merge-branch push, exact-source Preview, and pre-credential stop — 2026-08-15

The user authorized a normal fast-forward push of merge commit `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c`, a Git-connected Preview, and at most one fourth temporary Automation Bypass credential subject to exact release gates.

### Push preflight and PR diff

The final preflight passed:

- `origin/main`: `a72a7a861e4099725109407fa637bca135a15e32`;
- local HEAD: `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c`;
- remote integration branch before push: `3688f8d8dbe0513492b3615898f68ad047d564e5`;
- remote branch was an ancestor of local HEAD;
- tracked/staged worktree changes: 0;
- untracked paths: only `SEO_MAIN_INTEGRATION_REPORT.md` and `SEO_MAIN_ADVANCE_ASSESSMENT.md`;
- final `origin/main...HEAD` diff: 62 approved SEO/integration/QA files, +5,073 / -265;
- migration paths in PR diff: 0;
- incoming Instagram/TikTok/social runtime paths in PR diff: 0;
- report paths in PR diff: 0;
- `.env*`, OIDC, `.vercel/*`, and credential paths in PR diff: 0.

`git push origin codex/seo-integration-main` advanced only the feature branch, without force:

```text
3688f8d8..43c72fb8  codex/seo-integration-main -> codex/seo-integration-main
```

No commit was created, no report was staged, and `main` was not pushed.

### Draft PR #85 after push

| Check | Result |
|---|---|
| State | Open |
| Draft | true |
| Base | `main` / `a72a7a861e4099725109407fa637bca135a15e32` |
| Head | `codex/seo-integration-main` / `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c` |
| Mergeable state | `mergeable = true`, `mergeable_state = clean`, `rebaseable = true` |
| Auto-merge | off (`null`) |
| Vercel status | success — deployment completed |
| Vercel Preview Comments | success |
| PR file count | 62 |
| Duplicated migration/social incoming files | 0 |

No PR merge, ready-for-review transition, auto-merge, or merge-queue action was performed.

### Exact-source Git-connected Preview

| Item | Value |
|---|---|
| Project | `mnelo/hooma` |
| Preview URL | `https://hooma-2z0xyghdy-mnelo.vercel.app` |
| Deployment ID | `dpl_2KV9jGe8F4pyYya9HKLjpxQhYybK` |
| Target | Preview |
| Status | Ready |
| Source SHA | `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c` |
| Source ref | `codex/seo-integration-main` |
| Production/custom aliases | none |
| Branch alias | `hooma-git-codex-seo-integration-main-mnelo.vercel.app` |
| Protection baseline | bypass count 0; `all_except_custom_domains` |

The Preview was created by Git integration. No manual deployment command was run.

### Mandatory Production-ID gate failure

Before any credential creation or protected Preview QA, the live `hooma.ge` alias was inspected and did **not** match the authorized baseline:

- required Production deployment: `dpl_EZaWNhXpaPfTtnvauiRZHEFPkatN`;
- observed live Production deployment: `dpl_99oFUWBWZYPP35xYoidmhssBDouW`;
- observed URL: `hooma-12r0f7q0u-mnelo.vercel.app`;
- target/status: Production / Ready;
- source: `main` / `a72a7a861e4099725109407fa637bca135a15e32`;
- created: 2026-08-15 19:06:02.673 UTC;
- ready: 2026-08-15 19:07:17.924 UTC;
- aliases include `hooma.ge` and `www.hooma.ge`.

The previous `dpl_EZaWNhXpaPfTtnvauiRZHEFPkatN` and the newly live `dpl_99oFUWBWZYPP35xYoidmhssBDouW` both use the same `a72a7a86...` main source SHA. The newer Production deployment began about 15 minutes before the feature-branch push/Vercel Preview check at 19:20:57 UTC, so the timestamp/source evidence shows that it was not created by this feature-branch push. Its external trigger was not changed or inferred by this workflow.

The exact-deployment invariant nevertheless failed. Per the release rule, work stopped at this point:

- fourth Automation Bypass credentials created: 0;
- protected session-readiness QA: not run;
- real-data HTTP regression: not run (0/12 executed);
- product slugs sampled: none;
- browser release gate: not run;
- browser console/runtime/network QA: not run;
- Lighthouse runs: 0; no median inferred;
- fifth credential: not created.

### Stop-state cleanup and freshness

Because no credential or browser session was created, no revocation/profile deletion was required. Independent stop-state checks confirmed:

- `protectionBypassCount: 0`;
- protection mode remains exact `all_except_custom_domains`;
- an unauthenticated `HEAD /` to the exact Preview returns the Vercel Authentication 302 challenge;
- temporary browser profile/header/cookie/token/controller material created by this run: 0;
- secrets scan: pass; credential-signature matches 0, tracked `.vercel` paths 0, tracked report paths 0;
- mutation-capable HTTP methods sent to the application: 0;
- Server Action/API write, OAuth/login/account, social publish/refresh/cron, admin, DB/order/payment/refund/cancellation mutations: 0;
- Preview promotion, Production deployment, alias/domain/environment/protection-setting mutation: 0.

Production cannot be reported as unchanged relative to the approved starting deployment ID because it had already moved externally to `dpl_99oFUWBWZYPP35xYoidmhssBDouW`; this workflow did not cause or modify that deployment. Database state was not queried or mutated.

The final `git fetch origin --prune` at 2026-08-15 23:23:32 +04:00 confirmed:

- `origin/main = a72a7a861e4099725109407fa637bca135a15e32` — unchanged, so the Git/PR/Preview evidence is not provisional;
- remote integration HEAD = local HEAD = `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c`;
- worktree has no tracked/staged changes and retains only the two requested untracked reports.

## 12. Production baseline reconciliation and Phase B stop — 2026-08-15

This section supersedes earlier Production-baseline statements where they differ. It records the requested read-only reconciliation between the previous baseline and the deployment currently serving `hooma.ge`. No deployment, promote, rollback, redeploy, alias/domain/environment/protection setting, Production request with a mutation-capable method, credential, protected Preview request, or database mutation was performed.

### Deployment identity and configuration comparison

| Check | Previous baseline | Current live candidate | Result |
|---|---|---|---|
| Deployment ID | `dpl_EZaWNhXpaPfTtnvauiRZHEFPkatN` | `dpl_99oFUWBWZYPP35xYoidmhssBDouW` | inspected read-only |
| Project | `mnelo/hooma` / `prj_ZwRD6yZPQbRZCaV6oXTIoz0yIG7o` | same | pass |
| Target / status | Production / READY | Production / READY | pass |
| Git source | `main` / `a72a7a861e4099725109407fa637bca135a15e32` | same | pass |
| Framework / Node | Next.js / `24.x` | same | pass |
| Root/build/install/output/dev settings | root unset (`.` project root); commands unset/default | same | pass; no unexpected drift |
| Region | `iad1` | `iad1` | pass |
| Creator | Vercel user `mneloapp` | same | pass |
| Deployment source | `git` | `redeploy` | current deployment is a redeploy of the same source revision |
| Created / READY (UTC) | 17:49:54.356 / 17:50:53.837 | 19:06:02.673 / 19:07:17.924 | current deployment predates the feature-branch push/check at 19:20:57 UTC |

The deployment API exposes `source = redeploy` for the current candidate but did not expose an explicit parent deployment ID in the inspected safe metadata. The identical project, Git ref/SHA, creator, framework, Node version, root/build settings, and region support the same-source redeploy classification. No causal relationship beyond that metadata is inferred.

Environment values were never printed or retained. Safe name-only comparison found no removed name. The redeploy contains three additional deployment/build environment names: `INSTAGRAM_APP_SECRET`, `NX_SKIP_NX_CACHE`, and `TURBO_FORCE`. Project environment metadata identifies `INSTAGRAM_APP_SECRET` as a sensitive Production-scoped variable created at 19:02:46.698 UTC, before the 19:06 redeploy; the two build flags are not project environment entries. This explains the name-set difference without exposing any value. It does not change the matching Next.js/Node/root/build configuration gate.

Read-only alias inspection resolved `hooma.ge` directly to current deployment `dpl_99oFUWBWZYPP35xYoidmhssBDouW` at `hooma-12r0f7q0u-mnelo.vercel.app`. The current candidate was therefore the live Production deployment during reconciliation.

### Production HTTP and runtime-log gate

| Check | Result |
|---|---|
| `GET https://hooma.ge/` | HTTP 200; final host `hooma.ge`; HTML response |
| Production `X-Robots-Tag` | absent — no accidental Production noindex |
| `/robots.txt` | HTTP 404 on the current `main` deployment |
| `/sitemap.xml` | HTTP 404 on the current `main` deployment |
| Runtime fatal logs since deployment creation | 0 |
| Runtime HTTP 5xx since deployment creation | **5 — gate failure** |

The five 5xx entries are all read-only request-log records from the current Production deployment:

- method/path: `GET /api/social/oauth/instagram/start`;
- response: HTTP 503;
- source/environment: serverless / Production;
- deployment: exact `dpl_99oFUWBWZYPP35xYoidmhssBDouW`;
- timestamps: 19:19:30.098, 19:19:50.912, 19:20:13.932, 19:20:27.065, and 19:20:51.532 UTC.

Because the user-defined Phase A stop rule explicitly rejects any Production fatal/5xx evidence, reconciliation stopped here. The current candidate was **not** formally adopted as the Approved Production baseline. No rollback, promote, redeploy, alias change, OAuth execution, or endpoint reproduction was attempted. The two SEO endpoints' 404 baseline was recorded, but the HTTP 503 runtime evidence is the decisive blocker.

### Git, PR, Preview, and protection invariants at stop

- `origin/main`: exact `a72a7a861e4099725109407fa637bca135a15e32` after `git fetch origin --prune`;
- local and remote integration HEAD: exact `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c`;
- PR #85: OPEN, Draft, base `main` at `a72a7a86...`, head `codex/seo-integration-main` at `43c72fb8...`, CLEAN/MERGEABLE, Vercel checks successful, auto-merge off;
- Preview: `https://hooma-2z0xyghdy-mnelo.vercel.app`, deployment `dpl_2KV9jGe8F4pyYya9HKLjpxQhYybK`, READY, non-Production target, exact source `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c`, branch alias only;
- Preview custom/Production aliases: 0;
- `protectionBypassCount`: 0;
- protection mode: exact `all_except_custom_domains`.

### Phase B result and safety inventory

Phase B was not started because Phase A did not pass:

- fourth Automation Bypass credentials created: 0;
- protected Preview requests: 0;
- session-readiness gate: not run;
- real-data HTTP regression: 0/12 executed;
- browser release gate: not run;
- Lighthouse runs: 0; no median inferred;
- mutation-capable methods, Server Actions/API writes, OAuth/login/account creation, social publish/refresh/cron, admin actions, DB/order/payment/refund/cancellation mutations: 0;
- Production/DNS/Search Console/Vercel setting mutations: 0.

No credential cleanup or temporary browser-profile deletion was necessary because neither was created. The report remains intentionally uncommitted.

### Final freshness stop

The mandatory final `git fetch origin --prune` changed the source-of-truth after the reconciliation evidence above was collected:

- previous reconciled `origin/main`: `a72a7a861e4099725109407fa637bca135a15e32`;
- final fetched `origin/main`: `8f3b51e314d300d52035af8b57fb69cb8f2a0f52`;
- local/remote integration HEAD remained exact `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c`;
- the worktree still has no tracked/staged change and contains only the two untracked reports.

The same final read-only alias inspection also found that `hooma.ge` had advanced externally again:

- previously reconciled live candidate: `dpl_99oFUWBWZYPP35xYoidmhssBDouW`;
- final live deployment: `dpl_jjn8xqYZtYoens2v2e9vWeEvLP1G`;
- final live URL: `hooma-fe1kp30b0-mnelo.vercel.app`;
- target/status: Production / READY.

Therefore all `dpl_99...` reconciliation evidence is **stale/provisional** in addition to having failed the existing-5xx gate. Neither `dpl_99...` nor the newly observed `dpl_jjn8...` is approved by this report as the Production QA baseline. No automatic merge/rebase, new reconciliation, deployment inspection expansion, credential creation, protected Preview request, or QA continuation followed the freshness failure. `protectionBypassCount` remained `0`, protection mode remained `all_except_custom_domains`, and the final tracked-file credential/private-key scan reported 0 matches across 496 files.

## 13. Frozen-main release integration, Preview retest, and final blocker — 2026-08-16

This section supersedes earlier source, Production-baseline, and QA status statements where they differ.

### Release snapshot and integration

- first release-window fetch fixed `RELEASE_BASE_SHA` at `af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- the four commits added after the previous integration base were social-runtime fixes only: `d7d4398c`, `c0924921`, `afb0688d`, and `af67ba31`;
- the incoming delta changed 9 files with 738 additions and 59 deletions, including two social migrations; it had no file overlap with the SEO delta;
- read-only merge simulation found 0 textual, rename/delete, or add/add conflicts;
- ordinary merge commit: `ead00cf370a55b0cf2193bb8157beef31fcf3ed4`;
- merge parents: first `43c72fb89b17b7bc1f1cf01076eb3bfbb32a524c`, second `af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- actual merge conflict count: 0;
- `package.json`, `pnpm-lock.yaml`, package-manager/workspace settings, Next.js `15.5.21`, Instagram/TikTok scripts, and SEO regression/browser scripts were preserved;
- frozen lockfile: pass;
- migration gate: 71 files, exact match to `RELEASE_BASE_SHA`, duplicate timestamp/name 0, modified historical migration 0, SEO migration/schema diff 0;
- secret/credential diff against `RELEASE_BASE_SHA`: 0.

The merge and later favicon fix were pushed only to `codex/seo-integration-main` by ordinary fast-forward. Force-push and direct `main` push were not used.

### Full local verification

| Gate | Result |
|---|---|
| TypeScript | pass |
| ESLint | pass: 0 errors, 11 pre-existing warnings |
| Full MJS test suite after favicon fix | 152/152 pass |
| Instagram tests | 14/14 pass |
| TikTok/refresh tests | 25/25 pass |
| Canonical/hero/browser/storefront targeted fixtures | 37/37 pass |
| Production build | pass, Next.js 15.5.21, 36 pages; home 124 kB, product 204 kB |
| Frozen lockfile/offline install | pass |
| `git diff --check` | pass |
| Secret scan | pass; no credential/private-key regression |
| Migration comparison | pass; SEO schema delta 0 |

Dependency audit remains 5 high and 2 moderate findings, none classified as a release blocker under the approved runtime-reachability rule:

| Package/path | Findings | Runtime applicability | Fixed version | Blocker |
|---|---|---|---|---|
| `next > sharp@0.34.5` | inherited libvips CVEs, high | optional image optimizer path is unreachable because `images.unoptimized: true`; application has no runtime `sharp` import | `sharp >=0.35.0` | no |
| `next > postcss` | arbitrary source-map file reads/path traversal, 2 high | trusted build-time CSS only; no attacker-controlled CSS/source maps at runtime | `postcss >=8.5.18` | no |
| `next > postcss > nanoid` | invalid-size loop conditions, 2 high | build-tool transitive path; no application custom generator invocation | `nanoid >=3.3.18` | no |
| `next > postcss` | CSS stringify XSS, moderate | trusted build-time CSS only | `postcss >=8.5.10` | no |
| `next > postcss` | incomplete source-map file-read fix, moderate | trusted build-time CSS only | `postcss >=8.5.23` | no |

### First exact-source Preview and the two authorized QA sessions

- tested branch SHA: `ead00cf370a55b0cf2193bb8157beef31fcf3ed4`;
- Preview URL: `https://hooma-aoqbgqmc8-mnelo.vercel.app`;
- deployment: `dpl_HX4ccajUZ4c1qG5DHFmi12aqUCGM`;
- project/target/status: `mnelo/hooma` / Preview / READY;
- Production/custom alias: none.

Exactly two new temporary Automation Bypass credentials were created for this deployment, one at a time. Each was exact-host scoped in the QA process, was never placed in a URL/log/report/Git artifact, and was revoked immediately after its run. The active count never exceeded 1.

Both sessions reran the committed HTTP regression from check 1:

- HTTP SEO regression: **12/12 pass twice**;
- category sample: `/shop/3d-printer`;
- real products: `/product/true-spring-3037752`, `/product/bambu-lab-p2s-3039863`, `/product/ptfe-ams-1-ams-2-pro-3047971`;
- canonical: normalized exact `https://hooma.ge/`;
- Preview header: exact `noindex, nofollow, noarchive`;
- robots, real-data sitemap, category/product metadata, Product/Offer/BreadcrumbList/OnlineStore JSON-LD, OG image, legacy 308, unknown 404, and hostile Host checks: pass.

The second browser session passed readiness and the hero contract before the strict console assertion:

- document HTTP 200, final hostname exact, protection interstitial absent;
- Next bundle/RSC loaded with same-origin protection 302 count 0;
- stable DOM with 11 category slides;
- initial household slide index 0 and `aria-hidden="false"`;
- household hero pathname, `sizes="100vw"`, `loading="eager"`, `fetchpriority="high"`, and `1774×887`: pass;
- remaining 10 slides lazy/auto: pass;
- hero preload exactly once, one hero resource entry, image HTTP 200 with image content type: pass;
- browser gate then failed on exact console-error count 1, so cart/login-gate continuation and Lighthouse were correctly not run.

Read-only reproduction on the existing Production storefront identified the sole console failure as the browser's automatic request to missing `/favicon.ico`, which returned HTTP 404. It was pre-existing on `RELEASE_BASE_SHA` and unrelated to the SEO diff, but remained a blocker for the explicitly required `console error: 0` gate.

### Minimal application fix and new READY Preview

The minimal fix uses the existing real asset `public/brand/hooma-symbol.png` as root Next.js icon metadata and adds a targeted regression assertion:

- fix commit: `abbc4cc2fe4bd52b25930730986fda95e755c496` (`Add Hooma favicon metadata`);
- changed application/test files: `app/layout.tsx`, `tools/storefront-home-rules.test.mjs`;
- local production render: generated icon link `/brand/hooma-symbol.png`;
- local icon response: HTTP 200, `image/png`;
- local mutation-capable request count: 0;
- ordinary fast-forward push: `ead00cf3...abbc4cc2`;
- Draft PR #85: OPEN, CLEAN, Draft, auto-merge off, base `af67ba31...`, head `abbc4cc2...`;
- new exact-source Preview URL: `https://hooma-b9mysjbaf-mnelo.vercel.app`;
- new deployment: `dpl_tEBfaxnP5XYLHbJAWNEiEBm7n4sr`;
- project/target/status: `mnelo/hooma` / Preview / READY;
- source: exact `abbc4cc2fe4bd52b25930730986fda95e755c496`;
- aliases: branch Preview alias only; no Production/custom alias;
- GitHub Vercel and Preview Comments checks: pass.

No third credential was created. Because the release window authorized a maximum of two new credentials and both were already consumed before the genuine favicon defect was isolated, the new protected Preview cannot receive the required exact-source browser retest or three Lighthouse runs without additional authority. This is a real release blocker rather than a failed application assertion on the fixed build.

### Instagram 503 classification

The earlier five `GET /api/social/oauth/instagram/start` HTTP 503 records remain a **pre-existing P1 social-runtime issue, not an SEO release regression**:

- the SEO integration and favicon fix do not change the route, provider configuration, OAuth-state implementation, social schema, or related environment names relative to `RELEASE_BASE_SHA`;
- storefront, authentication, cart, checkout, and all 12 SEO regression checks are independent of this owner-only route;
- static route review confirms that its explicit 503 is emitted only by the guarded failure path around `providerConfig("instagram")` and `issueOAuthState(...)`, after feature gating and owner authorization;
- historical log retention still exposes the request/status records but no longer exposes the redacted `error_code`, so it is not possible to distinguish missing/invalid provider configuration from OAuth-state issuance failure without initiating a real owner OAuth flow, which this read-only release did not do.

The exact safe root-cause boundary is therefore the Instagram OAuth initialization/state-issuance path; the provider/DB subcause is intentionally not guessed. It remains P1 follow-up and non-blocking under the approved exception because it predates and is byte-identical across the SEO release diff.

### Stop-state safety and release status

- final `origin/main`: exact frozen `af67ba3132ad7a460636c56d44ac08fc96ccea57`; no release-freeze violation;
- local and remote integration HEAD: exact `abbc4cc2fe4bd52b25930730986fda95e755c496`;
- live Production: `dpl_6BSsVWRVH7wd6e1wMWoRjYxBqdba`, READY, source exact `af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- `hooma.ge` still resolves to that Production deployment;
- Production was not changed by this workflow;
- `protectionBypassCount: 0`;
- protection mode: exact `all_except_custom_domains`;
- unauthenticated new Preview request: HTTP 302 Vercel Authentication challenge;
- temporary controller/header/cookie/token/profile material: removed;
- mutation-capable application methods: 0;
- Server Action/API writes, OAuth/login/account creation, social publish/refresh/cron, admin action, DB/order/payment/refund/cancellation mutation: 0;
- Lighthouse runs on the fixed Preview: 0; no metrics or median inferred;
- PR Ready/merge, Preview promotion, Production deployment/rollback, www redirect, DNS, Search Console, sitemap submission, and Rich Results checks: not performed because the Preview release gate is incomplete;
- docs commit: not created; both reports remain intentionally uncommitted.

Release outcome: **blocked before PR Ready/merge and Production release solely by exhaustion of the two explicitly authorized temporary bypass credentials needed to retest the fixed protected Preview.**

## 14. One-time third credential attempt and safe stop — 2026-08-16

This section supersedes Section 13's credential-availability statement. The user granted one additional, one-time Automation Bypass credential for the existing fixed Preview only:

- Preview: `https://hooma-b9mysjbaf-mnelo.vercel.app`;
- deployment: `dpl_tEBfaxnP5XYLHbJAWNEiEBm7n4sr`;
- exact source: `abbc4cc2fe4bd52b25930730986fda95e755c496`.

### Preflight

- `origin/main`: exact frozen `af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- local/remote integration HEAD: exact `abbc4cc2fe4bd52b25930730986fda95e755c496`;
- Preview project/status/source: `mnelo/hooma`, READY, exact authorized SHA;
- Preview Production/custom aliases: 0;
- PR #85: OPEN, Draft, CLEAN, auto-merge off;
- initial `protectionBypassCount`: 0;
- protection mode: `all_except_custom_domains`;
- live Production: `dpl_6BSsVWRVH7wd6e1wMWoRjYxBqdba`, READY, source exact `RELEASE_BASE_SHA`, homepage HTTP 200, Production `X-Robots-Tag` absent.

### Credential lifecycle and harness failure

Exactly one additional credential was generated. The Vercel API accepted the generation request and active count became 1, but the returned JSON placed the newly generated value outside the controller's expected `protectionBypass.secret` field. The safety controller therefore never retained a usable credential value in memory and stopped before starting HTTP regression, browser navigation, or Lighthouse.

Because the controller did not possess the value, its ordinary `finally` branch could not revoke by value. The emergency cleanup path then read the sole active key from project state entirely inside one process, revoked it through stdin, cleared the in-process reference, and printed only the final count/mode. The credential value was never printed, placed in argv/environment/query strings, written to a file, stored in Git/report output, or sent to any origin.

Classification: **QA harness/API-response-shape defect; not an application failure.** No application or tracked QA-harness file changed, and no new commit/Preview was created.

### QA and cleanup outcome

- fixed-Preview protected HTTP requests after credential generation: 0;
- fixed-Preview HTTP regression: not started;
- browser readiness/application QA: not started;
- Lighthouse runs: 0;
- mutation-capable request, Server Action/API write, OAuth/social action, DB/order/payment/refund/cancellation mutation: 0;
- final `protectionBypassCount`: 0;
- protection mode: unchanged `all_except_custom_domains`;
- unauthenticated Preview: HTTP 302 Vercel Authentication challenge;
- temporary loader/controller/emergency-cleanup files: deleted;
- temporary cookies/browser profiles/tokens: 0 remaining;
- final `origin/main`: exact frozen `af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- live Production: unchanged `dpl_6BSsVWRVH7wd6e1wMWoRjYxBqdba`, READY, source `af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- PR #85: still OPEN/Draft/CLEAN; no Ready transition, merge, promotion, or Production deployment.

Release outcome: **stopped safely because the exactly-one additional credential authorization was consumed by generation and revocation before it could be used. Creating another credential would exceed the explicit one-time authorization.**

## 15. Final Production release attempt, hard gate failure, and rollback — 2026-08-16

### Approved Preview infrastructure exception

The user approved `PREVIEW_PROTECTION_INFRASTRUCTURE_EXCEPTION` based on the two earlier 12/12 Preview HTTP passes, successful readiness/hero evidence, the isolated favicon-only browser defect, the minimal existing-asset favicon fix, and the complete local verification record. Therefore another protected fixed-Preview regression and Lighthouse cycle was explicitly waived as a pre-merge blocker.

No Computer Use session was connected. No Hooma Shareable Link or automation bypass credential was created or modified, no project-wide Deployment Protection setting changed, and the existing `mnelo/devdariani` Shareable Link was not accessed or changed.

### Final frozen-release checks and merge

| Item | Verified value |
|---|---|
| `origin/main` after required pre-merge fetch | `af67ba3132ad7a460636c56d44ac08fc96ccea57` |
| PR head | `abbc4cc2fe4bd52b25930730986fda95e755c496` |
| PR state before merge | `#85`, CLEAN, exact base/head, Ready |
| Checks | Vercel success; Vercel Preview Comments success |
| Auto-merge | off |
| Merge method | merge commit |
| Merge commit | `4d66bb4fef0cceaadbf7082bfeb5613f70487bef` |
| Merge commit tree | `8eee19984adaf6278dc3b78436f6d07a74393d88` |
| PR-head tree | `8eee19984adaf6278dc3b78436f6d07a74393d88` |

The release freeze held at the required action boundary. PR #85 was marked Ready and merged without enabling auto-merge. The merge tree is byte-identical to the reviewed PR-head tree.

### Rollback target and exact Production deployment

The live Production deployment recorded before release was:

- deployment: `dpl_6BSsVWRVH7wd6e1wMWoRjYxBqdba`;
- source: `main@af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- status: `READY`;
- live homepage: HTTP 200.

After the merge, no automatic Production deployment appeared during the observed deployment window. The already-authorized Production release was therefore created through Vercel's deployment API from exact Git source `main@4d66bb4fef0cceaadbf7082bfeb5613f70487bef`:

- new deployment: `dpl_HGEHDZ7avpZAGcu6Pdp6HejZ6RYS`;
- deployment URL: `hooma-bf2743fje-mnelo.vercel.app`;
- target/status before QA: `production` / `READY`;
- source SHA/ref: exact merge commit / `main`;
- promoted custom domain for QA: `https://hooma.ge`.

No application source change or new commit was introduced between the reviewed merge tree and this deployment.

### Immediate live hard-gate failure

The committed Production HTTP SEO regression was started first, with Preview-only and not-yet-configured `www` assertions correctly inactive. It stopped with the release-blocking result:

`SEO regression failed: sitemap must include public catalog URLs`

The observed request and runtime evidence was:

| Evidence | Result |
|---|---|
| `/robots.txt` on the new release | HTTP 200 |
| `/sitemap.xml` on the new release | HTTP 200 |
| Real catalog URLs in sitemap | missing; mandatory assertion failed |
| Sitemap runtime log | `[storefront-catalog] Failed to load sitemap products. JWT issued at future` |
| Log request/status | `GET /sitemap.xml`, HTTP 200, serverless cache MISS |
| New release HTTP 5xx logs | 0 |
| New release fatal logs | 0 |

The sitemap implementation catches the failed Supabase-backed catalog query and can still return HTTP 200 with only static entries. The safe root-cause boundary is the Production Supabase catalog authentication/read path used by sitemap generation. The evidence does not safely distinguish a clock issue from a credential issuance/configuration issue, so no narrower subcause is claimed.

This simultaneously failed the real-data sitemap gate and the required 12/12 regression gate. Per the approved release rules, no later browser funnel, console, hero, or Lighthouse gate could convert that artifact into a releasable result.

### Immediate rollback and live recovery

Rollback to the recorded target `dpl_6BSsVWRVH7wd6e1wMWoRjYxBqdba` was executed immediately. Final independent checks confirmed:

- rollback status: success;
- `https://hooma.ge` resolves to `dpl_6BSsVWRVH7wd6e1wMWoRjYxBqdba`;
- deployment state: `READY`;
- source: exact `af67ba3132ad7a460636c56d44ac08fc96ccea57`;
- homepage: HTTP 200 with no redirect;
- `/robots.txt`: HTTP 404;
- `/sitemap.xml`: HTTP 404.

Both public custom domains, `hooma.ge` and `www.hooma.ge`, resolve to the rollback deployment; `www` remains HTTP 200 without the success-only redirect. The protected generated alias `hooma-git-main-mnelo.vercel.app` still maps to the failed deployment and returns an unauthenticated HTTP 302 Vercel Authentication challenge. It was not changed because the public live domains were already safely restored and this failed release did not authorize success-only alias work.

The two 404s are the explicitly known pre-release state of the rollback artifact, not a newly accepted SEO release. They demonstrate that the prior Production state was restored; the merged SEO release remains absent from the live domain.

### Deferred success-only work and final status

Because rollback was mandatory at the first hard gate, the following were correctly not performed on the failed artifact:

- remaining fixed-product/category metadata and browser DOM checks;
- product → local cart → checkout → login funnel;
- three Production Lighthouse runs and medians;
- `www.hooma.ge → hooma.ge` permanent 308 configuration;
- Search Console property, TXT, sitemap submission, URL inspection, or Rich Results actions.

No order, payment, refund, OAuth state, social publication, admin action, or database mutation was created. The pre-existing Instagram OAuth 503 remains a separate P1 social-runtime issue and is not implicated in the sitemap failure.

Final release status: **rolled back / not live**. GitHub `main` contains merge commit `4d66bb4fef0cceaadbf7082bfeb5613f70487bef`, while live Production safely remains on `af67ba3132ad7a460636c56d44ac08fc96ccea57`. A new release attempt requires remediation and revalidation of the Production Supabase-backed sitemap catalog read.

## 16. Production sitemap remediation and first successful live artifact — 2026-08-20

This section and Section 17 supersede Section 15's final rollback status.

### Bounded root cause and remediation

The failed release's `JWT issued at future` message originated from the server-only Supabase credential used by the sitemap/catalog path; no browser cookie or user session participated. Current database grants require the server-side service role for `storefront_product_cards` and the catalog RPCs, so replacing that read with an anonymous/publishable client would have violated the existing database contract.

The remediation therefore kept the server-only client and made failures observable and fail-closed:

- PR #95: `fix(seo): harden Production sitemap catalog authentication`;
- head: `eba77bb488ccea858378474d6cce5d73fcb83f86`;
- merge commit: `5d76a9186fd8cd6dd67088d3175650f150053290`;
- exact base: `4d66bb4fef0cceaadbf7082bfeb5613f70487bef`;
- migration/RLS/schema change: 0;
- package/lock change: 0;
- targeted sitemap tests: 7/7 pass;
- full MJS suite: 164/164 pass;
- TypeScript, changed-file ESLint, and diff check: pass.

Vercel's unreadable sensitive server-key record was preserved for Preview only; a Hooma-matched sensitive server key was added for Production only. The final metadata shape is exactly two sensitive `SUPABASE_SECRET_KEY` records with disjoint Preview and Production targets. No raw value, token, fingerprint, or environment-record identifier is retained in this report.

The first repaired Production artifact served a real-data sitemap successfully, but browser funnel QA then found an independent same-origin redirect defect: apex `/checkout` was redirected through the canonical `www` host by middleware. This was classified as a core storefront/auth gate failure and the public domain was returned to the recorded rollback deployment while the redirect was fixed.

## 17. Auth-origin hotfix, final Production release, and complete QA — 2026-08-20

### Narrow hotfix and merge

PR #96 changed exactly `middleware.ts` and `tools/auth-confirmation-rules.test.mjs`. It restored request-origin redirects for the four protected middleware branches while retaining canonical-site behavior in the separate callback/canonical helper.

| Item | Value |
|---|---|
| PR | #96, `fix(auth): preserve same-origin middleware redirects` |
| Head | `b766075549b8164223561b420a19cc72c3a72315` |
| Base | `5d76a9186fd8cd6dd67088d3175650f150053290` |
| Merge strategy | merge commit; auto-merge not used |
| Merge commit / final source | `44f0d78e45d176321fa32cbeda865f057b167745` |
| Auth/middleware tests | 9/9 pass |
| Sitemap tests | 8/8 pass |
| Full MJS suite | 160/160 pass |
| Instagram tests | 14/14 pass |
| TikTok tests | 25/25 pass |
| TypeScript / build | pass |
| ESLint | 0 errors; 11 pre-existing warnings |
| Package, lockfile, migrations | unchanged |
| Diff and credential scans | pass |

### Exact Production artifact

- deployment: `dpl_DzVdGrPzsoFxQALR3zLSxwpyPJW2`;
- generated deployment URL: `hooma-8dv9xpciq-mnelo.vercel.app`;
- target/state: Production / READY / Current;
- source ref/SHA: exact `main@44f0d78e45d176321fa32cbeda865f057b167745`;
- live custom domain: `https://hooma.ge`;
- recorded rollback target retained for emergency use: `dpl_6BSsVWRVH7wd6e1wMWoRjYxBqdba`.

### Live HTTP and structured-data regression

The public Production HTTP regression passed all 12 required groups:

1. `robots.txt`: 200 with the required policy and sitemap declaration.
2. `sitemap.xml`: 200, valid XML, 1,470 unique apex URLs, real categories/products, and forbidden/private paths excluded.
3. Homepage: 200, indexable, metadata/canonical/social cards/OnlineStore valid.
4. Category `/shop/3d-printer`: metadata, canonical, BreadcrumbList, and real product anchors valid.
5. Required products `true-spring-3037752`, `bambu-lab-p2s-3039863`, and `ptfe-ams-1-ams-2-pro-3047971`: distinct metadata plus Product, Offer, SKU, GEL price, availability, image, and BreadcrumbList valid.
6. Search/filter variants: noindex with normalized canonical.
7. Cart/login/checkout: private noindex behavior and auth routing valid.
8. Legacy route: permanent 308; unknown product/category: 404.
9. Open Graph image: PNG, exact 1200×630.
10. Favicon `/brand/hooma-symbol.png`: 200, `image/png`.
11. Host-confusion defense: redirect target cannot escape the trusted site.
12. Production indexability: no `X-Robots-Tag: noindex` and no robots-meta noindex.

Dynamic sitemap/category/product output also provided direct evidence that live Supabase catalog reads were successful.

### Browser, hero, and safe funnel QA

The homepage reached `readyState=complete`, loaded the Next.js runtime, showed no error boundary or protection interstitial, and remained DOM-stable. The hero contract passed all assertions:

- 11 category slides;
- exactly one household slide at initial index 0;
- expected household image and category link;
- active slide `aria-hidden=false`, `sizes=100vw`, eager/high priority, 1774×887;
- remaining 10 images lazy/auto;
- one preload, one observed hero resource, HTTP 200 image response, and non-zero responsive render.

The category and all three required product pages passed exact-path, canonical, metadata, JSON-LD, readiness, and storefront checks. The existing authenticated browser context already contained the required product in browser-local cart state; opening the cart verified the dialog, item, and checkout CTA. Following the CTA remained same-origin and followed the expected authenticated staff route. A separate anonymous HTTP check proved `/checkout` makes one same-origin redirect to `/login?next=%2Fcheckout` and finishes at a 200 noindex login page.

No login form, checkout, payment, order, refund, OAuth, social, admin mutation, or database mutation was submitted.

Console errors: 0. Page/runtime exceptions: 0. New same-origin 5xx: 0.

### Lighthouse

Three Lighthouse 13.4.1 mobile/default-throttling runs completed without runtime errors or warnings.

| Metric | Run 1 | Run 2 | Run 3 | Median | Gate |
|---|---:|---:|---:|---:|---|
| Performance | 99 | 92 | 99 | **99** | ≥85 pass |
| LCP | 1.744 s | 3.296 s | 1.995 s | **1.995 s** | ≤4.0 s pass |
| TTFB | 69 ms | 69 ms | 67 ms | **69 ms** | reported |
| CLS | 0 | 0 | 0 | **0** | ≤0.1 pass |
| TBT | 43 ms | 1 ms | 9 ms | **9 ms** | ≤200 ms pass |
| FCP | 1.214 s | 1.425 s | 1.247 s | **1.247 s** | reported |
| Speed Index | 2.631 s | 2.083 s | 2.992 s | **2.631 s** | reported |

### Runtime, redirect, protection, and search-platform completion

The exact deployment's Vercel log view reported Warning 0, Error 0, and Fatal 0. Its observed status-code inventory contained 200, 304, expected 307/308, and the deliberate unknown-route 404 checks; no 5xx status was present. The prior sitemap JWT error did not recur.

`www.hooma.ge` is now configured as a permanent 308 redirect to `hooma.ge`. Root, path, and query are preserved in a single hop; the final apex URL returns 200.

Google Search Console work completed:

- Domain property `hooma.ge` created and ownership verified through the required root TXT record;
- `https://hooma.ge/sitemap.xml` submitted and read successfully;
- sitemap status: Success; discovered pages: 1,470;
- homepage inspection: indexed / URL is on Google;
- category and all three required product inspections: not indexed yet; no indexing request was sent;
- all three products: Rich Results Test crawled successfully, 3 valid items each (Product snippets, Merchant listings, Breadcrumbs), critical errors 0.

Deployment Protection remains Vercel Authentication with Standard Protection for protected deployments. Final Hooma automation-bypass credential count: 0. Final active Hooma Shareable Link count: 0. The clean fixed Preview still returns the unauthenticated 302 protection challenge. No Shareable Link or bypass credential was created in this successful completion, and the unrelated `mnelo/devdariani` Shareable Link was neither inspected nor modified.

The known Instagram OAuth 503 remains a separate P1 social-runtime problem, unchanged by the SEO/auth-origin diffs and non-blocking for this release.

### Final status

**RELEASED / LIVE / ALL DEFINED PRODUCTION GATES PASSED.**

The documentation update is isolated to these two Markdown reports and is not part of the application release tree.
