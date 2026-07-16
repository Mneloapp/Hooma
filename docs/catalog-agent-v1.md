# Catalog Agent V1

Catalog Agent accepts a whole public catalog category, discovers its product pages, extracts each rendered page with the same engine as Hooma Catalog Clipper, and creates private product Drafts for human review.

## Architecture

1. Owner registers a machine identity in Admin → Catalog Agent.
2. Hooma shows a revocable token once. Only its SHA-256 hash and short prefix are stored.
3. Catalog staff creates a job with a source category URL, authoritative Hooma category, assigned agent, and maximum product count.
4. A Windows Playwright worker claims the job and discovers product links from the rendered category page.
5. The worker claims one product item at a time and evaluates `tools/hooma-catalog-clipper/extractor.js` in the rendered product page.
6. The protected API validates the token, job ownership, source host, job limit, category, media URLs, required fields, active material profile, and default pricing profile.
7. Complete results become `products.status = draft` and `production_status = test_required`. Incomplete results become `source_imports.status = needs_review`.
8. Existing Owner/Admin publication gates remain authoritative. The agent has no publish, edit, archive, delete, pricing, team, order, or production permissions.

## Database

Migration `20260716000200_catalog_agent_v1.sql` adds:

- `catalog_agents`: hashed machine credentials, minimal scopes, revocation and last-seen data.
- `catalog_agent_jobs`: category source, authoritative Hooma category, processing limit, resumable status and counters.
- `catalog_agent_items`: deduplicated source URLs, extraction payload, review status, product/import references and retry state.
- Atomic service-role-only job/item claim functions using `FOR UPDATE SKIP LOCKED`.
- A counter refresh function for consistent dashboard progress.

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

The token is never accepted by browser admin routes and is never a Supabase session or service-role credential.

## Threat review

- **Credential theft:** tokens are shown once, stored hashed, scoped narrowly, and immediately revocable in Admin.
- **Privilege escalation:** machine endpoints do not accept publication state, product category, pricing IDs, actor IDs, or arbitrary database operations from the worker. Server-owned job data and active database profiles are authoritative.
- **Duplicate/replay:** job/source URLs are unique, item claims are atomic, existing `source_imports` and `product_sources` are checked, and repeated Draft submissions return the existing result.
- **SSRF/off-site discovery:** category and product URLs must be HTTPS, credential-free, use allowed catalog hosts, and remain on the assigned source host. The API stores media references but does not server-fetch worker-supplied URLs.
- **Unbounded crawling:** every job has a server-side 1–10,000 product cap; discovery accepts at most 100 URLs per request.
- **Concurrent workers/crashes:** `SKIP LOCKED`, status transitions, heartbeats, and stale item reclaim make processing resumable.
- **Source blocking:** the worker detects CAPTCHA/human-verification pages and stops. It does not bypass access controls.
- **Unsafe publication:** imported products remain Draft/test-required and keep source-rights review pending until the existing human publication workflow is satisfied.

## Windows worker

See `tools/hooma-catalog-agent/README.md`. The worker uses a dedicated persistent Chrome profile and polls Hooma for assigned work. It can run interactively first, then be installed as a Windows startup task or service after the end-to-end test is accepted.

