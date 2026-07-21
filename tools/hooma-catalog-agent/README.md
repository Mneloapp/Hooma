# Hooma Catalog Agent · Windows V1

This worker has two resumable modes:

1. Import mode receives a whole catalog category from Hooma, discovers its product pages, runs the same extraction engine as the Hooma Catalog Clipper, and sends reviewed data back as private Drafts.
2. Audit mode walks existing Hooma products with keyset pagination and uses vision to propose natural Georgian/English names, concise copy, approximate `X × Y × Z mm` dimensions, and a relevant product-image set.

## Security model

- The worker receives a revocable `hooma_ca_...` token, never a Supabase secret.
- The token can only claim assigned jobs, create Draft results, and submit audit proposals.
- Publishing, deleting products, pricing settings, users, orders, and production are unavailable.
- Audit proposals never update a product automatically. Owner/Admin/Catalog Manager approval is required, the previous values are retained in Audit log, and removed gallery images remain in Storage for rollback.
- Hooma validates the job category, source host, pricing profile, material profile, product limits, and idempotency server-side.
- The worker stops and reports an error when a source requests CAPTCHA or human verification. It does not bypass access controls.

## Windows setup

1. Install current Node.js LTS and Google Chrome.
2. Open PowerShell in `tools\hooma-catalog-agent`.
3. Run `powershell -ExecutionPolicy Bypass -File .\install.ps1`.
4. In Hooma Admin → Catalog Agent, register `Hooma Catalog Agent · Windows 01`.
5. Copy the one-time token into `.env` as `HOOMA_AGENT_TOKEN`.
6. Set `HOOMA_BASE_URL=https://www.hooma.ge`. Use the canonical `www` host directly: a redirect from `hooma.ge` can remove the `Authorization` header and return HTTP 401.
7. For product audits, add an OpenAI Platform API key as `OPENAI_API_KEY`. The key stays on this Windows worker and is sent only to `api.openai.com`.
8. Run `powershell -ExecutionPolicy Bypass -File .\run.ps1`.

`HOOMA_WORKER_MODE` can be `all`, `import`, or `audit`. For a large existing catalog, set the worker to `audit` so category imports cannot delay the quality audit. Audit-only mode does not launch Chrome; it runs as a lightweight API worker. The default audit concurrency is 2 and can be raised carefully with `HOOMA_AUDIT_CONCURRENCY` according to the API project's rate limits.

In `import` or `all` mode, Chrome opens with a dedicated profile in `.hooma-browser-profile`. Keep this window available to the worker. If the source asks for a normal consent, login, or verification step, complete it in that browser and restart the job. A failed job can be recreated from the Hooma admin page.

MakerWorld may repeatedly request bot verification from an automated Playwright window. In that case, keep this background worker for sources such as Printables and use the ordinary-Chrome **MakerWorld Assisted Mode** documented in `../hooma-catalog-clipper/README.md`. Register a separate agent/token for Assisted Mode so it cannot race this worker for jobs.

## Job flow

1. Owner registers the agent and receives a one-time token.
2. Catalog staff submits a category URL, Hooma category, and maximum product count.
3. The worker discovers and deduplicates product URLs.
4. Each page is processed with `../hooma-catalog-clipper/extractor.js`.
5. Complete records become `products.status = draft`.
6. Records missing name, description, media, material, weight, or print time go to Import Review.
7. Only Owner/Admin can publish products through the existing publication workflow.

## Existing-product audit flow

1. Admin → Catalog Agent → Product Quality Auditor creates one audit job for Active, Draft, and/or Archived products.
2. The worker claims one bounded product snapshot at a time; it never loads the entire catalog into memory.
3. Up to 12 public product images and the current copy are analyzed with Structured Outputs.
4. Every image gets an explicit keep/remove decision, one kept image becomes the proposed hero, and dimensions are always marked approximate.
5. The proposal appears in Admin with before/after names and copy, image decisions, confidence, and warnings. Staff can manually keep or remove any reviewed image before approval.
6. Staff may approve or reject one product, delete an unwanted product through the existing protected catalog-deletion workflow, or approve up to 100 warning-free proposals at 85%+ confidence after typing `APPLY`.
7. Approval changes names, copy, approximate dimensions, size label when it is Standard/Standart, and the public gallery. Price, product status, publication, license, and production data are preserved.
8. An approved product receives a permanent audit marker and is excluded from every future audit job. Its immutable audit evidence remains in the database and Audit log but disappears from the active review queue.
