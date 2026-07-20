# Catalog Agent V1

Catalog Agent accepts a whole public catalog category, discovers its product pages, extracts each rendered page with the same engine as Hooma Catalog Clipper, and creates private product Drafts for human review.

The same least-privilege worker can also run existing-product quality audits. It proposes concise Georgian/English copy, approximate dimensions, and gallery cleanup, but only a human catalog manager can apply those changes.

## Architecture

1. Owner registers a machine identity in Admin → Catalog Agent.
2. Hooma shows a revocable token once. Only its SHA-256 hash and short prefix are stored.
3. Catalog staff creates a job with a source category URL, authoritative Hooma category, assigned agent, and maximum product count.
4. A Windows Playwright worker claims the job and discovers product links from the rendered category page.
5. The worker claims one product item at a time and evaluates `tools/hooma-catalog-clipper/extractor.js` in the rendered product page.
6. The protected API validates the token, job ownership, source host, job limit, category, media URLs, required fields, active material profile, and default pricing profile.
7. Complete results become `products.status = draft` and `production_status = test_required`. Incomplete results become `source_imports.status = needs_review`.
8. Existing Owner/Admin publication gates remain authoritative. The agent has no publish, edit, archive, delete, pricing, team, order, or production permissions.

For an Agent-created Draft whose external source has not previously been reviewed, the product page shows one Admin publication confirmation instead of a separate license form. An Admin/Owner must inspect the source reference, product data and media, explicitly confirm publication authority, and submit the form. The review is stored with the source snapshot and actor in `catalog_publication_reviews` plus `audit_log`; only then does the existing publication function run.

MakerWorld also supports **Clipper Auto Queue Mode V2** in an ordinary Chrome profile. After the operator completes the site's human verification and explicitly presses Start, a persistent Manifest V3 worker claims assigned jobs, discovers the category in one pinned tab, extracts one product at a time and creates private Drafts. It pauses without losing the item whenever verification reappears and resumes only after the operator completes it and presses Resume. It performs no automatic CAPTCHA solving, stealth/fingerprint changes, cookie export, or access-control bypass. The previous fully manual Clipper controls remain available. Use a separate agent identity/token so two workers cannot claim the same assigned job.

## Database

Migration `20260716000200_catalog_agent_v1.sql` adds:

- `catalog_agents`: hashed machine credentials, minimal scopes, revocation and last-seen data.
- `catalog_agent_jobs`: category source, authoritative Hooma category, processing limit, resumable status and counters.
- `catalog_agent_items`: deduplicated source URLs, extraction payload, review status, product/import references and retry state.
- Atomic service-role-only job/item claim functions using `FOR UPDATE SKIP LOCKED`.
- A counter refresh function for consistent dashboard progress.

Migration `20260721000100_catalog_product_auditor.sql` adds:

- `catalog_product_audit_jobs`: a snapshot-bounded, keyset-paginated queue that remains bounded at 100,000+ products.
- `catalog_product_audit_items`: immutable before snapshots, structured proposals, confidence, warnings, review state, and model trace IDs.
- Service-role-only claim/counter functions and an audited apply function with optimistic concurrency checks.
- A product cursor index on `(status, created_at, id)` and a ready-result index for bounded review batches.
- The `audits:process` machine scope, which can submit proposals but cannot apply them.

Apply it from the Hooma repository after linking Supabase:

```bash
supabase db push --linked --dry-run
supabase db push --linked
supabase migration list --linked
```

## API

All routes require `Authorization: Bearer hooma_ca_...` and run in the Node.js runtime:

- `POST /api/catalog-agent/jobs/claim`
- `POST /api/catalog-agent/jobs/:jobId/discover`
- `POST /api/catalog-agent/jobs/:jobId/items/claim`
- `POST /api/catalog-agent/jobs/:jobId/items/:itemId/draft`
- `POST /api/catalog-agent/jobs/:jobId/complete`
- `POST /api/catalog-agent/audits/claim`
- `POST /api/catalog-agent/audits/:jobId/items/claim`
- `POST /api/catalog-agent/audits/:jobId/items/:itemId/review`
- `POST /api/catalog-agent/audits/:jobId/complete`

The token is never accepted by browser admin routes and is never a Supabase session or service-role credential.

Production clients must call the canonical `https://www.hooma.ge` host directly. Calling `https://hooma.ge` first can follow a cross-origin redirect that drops the bearer `Authorization` header and causes HTTP 401.

## Threat review

- **Credential theft:** tokens are shown once, stored hashed, scoped narrowly, and immediately revocable in Admin.
- **Privilege escalation:** machine endpoints do not accept publication state, product category, pricing IDs, actor IDs, or arbitrary database operations from the worker. Server-owned job data and active database profiles are authoritative.
- **Duplicate/replay:** job/source URLs are unique and item claims are atomic. Discovery, claim and Draft submission all check existing `source_imports` and `product_sources` by stable platform + source model ID with canonical URL fallback. A local extension history avoids repeat capture in the same Chrome profile, while server checks cover other jobs and machines. Existing imports in review are treated as already extracted.
- **SSRF/off-site discovery:** category and product URLs must be HTTPS, credential-free, use allowed catalog hosts, and remain on the assigned source host. The API stores media references but does not server-fetch worker-supplied URLs.
- **Unbounded crawling:** every job has a server-side 1–10,000 product cap; discovery accepts at most 100 URLs per request.
- **Concurrent workers/crashes:** `SKIP LOCKED`, status transitions, heartbeats, and stale item reclaim make processing resumable.
- **Source blocking:** the worker detects CAPTCHA/human-verification pages and stops. It does not bypass access controls.
- **Unsafe publication:** imported products remain Draft/test-required and keep source-rights review pending until the existing human publication workflow is satisfied.
- **Prompt injection and untrusted media:** product text, URLs, and image text are explicitly treated as untrusted data; the model receives no tools or database credentials and returns a strict JSON schema.
- **Unsafe mass edits:** the worker cannot call the apply function. Every proposal is reviewed in Admin; bulk approval is capped at 100 warning-free items with at least 85% confidence and requires typing `APPLY`.
- **Lost manual changes:** apply compares product and variant revision timestamps with the audited snapshot and rejects stale proposals.
- **Destructive media cleanup:** approval removes unrelated media from the public gallery but retains storage objects and the previous URL list in `audit_log` for rollback.

## Windows worker

See `tools/hooma-catalog-agent/README.md` for the Playwright worker. For MakerWorld, prefer the ordinary-browser Auto Queue described in `tools/hooma-catalog-clipper/README.md`, because it preserves the user's verified Chrome session and pauses for any new human check.
