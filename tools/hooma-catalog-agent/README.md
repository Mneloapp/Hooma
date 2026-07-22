# Hooma Catalog Agent · Windows V1

This worker has two resumable modes:

1. Import mode receives a whole catalog category from Hooma, discovers its product pages, runs the same extraction engine as the Hooma Catalog Clipper, and sends reviewed data back as private Drafts.
2. Audit mode walks existing Hooma products with keyset pagination and uses vision to propose natural Georgian/English names, concise copy, approximate `X × Y × Z mm` dimensions, and a relevant product-image set.

## Security model

- The worker receives a revocable `hooma_ca_...` token, never a Supabase secret.
- The token can only claim assigned jobs, create Draft results, and submit audit proposals.
- Publishing, deleting products, pricing settings, users, orders, and production are unavailable.
- Every audit result remains in Audit Agent for manager review. AI never applies product changes automatically. Existing media, colors, and AMS mode are preserved until the manager edits and approves the product.
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

`HOOMA_WORKER_MODE` can be `all`, `import`, or `audit`. For a large existing catalog, set the worker to `audit` so category imports cannot delay the quality audit. Audit-only mode does not launch Chrome; it runs as a lightweight API worker. The default audit concurrency is 2 and can be raised carefully with `HOOMA_AUDIT_CONCURRENCY` according to the API project's rate limits. The low-cost defaults use `gpt-5-mini`, low reasoning, exactly one catalog image at low detail, 1,000 reference-evidence characters, and an 800-token output budget. `HOOMA_AUDIT_REFERENCE_CHARS` and `HOOMA_AUDIT_MAX_OUTPUT_TOKENS` remain available for controlled copy-quality experiments; image count is intentionally fixed at one.

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

1. Admin → Audit Agent creates one audit job for Active, Draft, and/or Archived products.
2. The worker claims one bounded product snapshot at a time; it never loads the entire catalog into memory. The database seals a permanent attempt immediately before returning that snapshot to the model worker.
3. One public product image, the current copy, and a bounded public-text extract from the allow-listed source reference (when readable) are analyzed with Structured Outputs in at most one OpenAI POST. Cookies, login state, customer data, internal costs, and private admin data are never sent.
4. AI proposes only Georgian/English names, concise descriptions, and approximate dimensions. A completed model result is durably spooled before delivery, so a temporary Hooma API/network failure replays that result instead of spending tokens on the same item again.
5. Existing gallery, hero image, customer-choice colors, and AMS mode are carried forward unchanged for manager review.
6. For retained exceptions, staff may edit and approve or reject one product, delete an unwanted product through the existing protected catalog-deletion workflow, or approve up to 100 warning-free proposals at 85%+ confidence after typing `APPLY`.
7. Only manager approval changes the product. The manager can edit the proposed copy and dimensions and may manually adjust media, offered colors, or AMS/customer-choice mode before approval. Price, product status, publication, license, and production data are preserved.
8. A valid AI result receives a permanent completion marker immediately, before human approval or rejection, and is excluded from every future audit job. Approval remains a separate action that applies the reviewer-edited copy, dimensions, and media. Immutable AI evidence stays in the database and Audit log.

The worker makes at most one paid OpenAI request per claimed product; it never automatically repeats that request. Before delivery, a completed result is written and synced through `.audit-result-spool`, and a valid temp file is recovered after a restart. A crash after the database seals an attempt but before the response is durably spooled deliberately leaves that product attempted/failed for manual review instead of risking a second charge. Corrupt, conflicting, or permanently rejected delivery entries move to `.audit-result-spool/quarantine` instead of being deleted. While a retryable result remains pending delivery, new audit claims pause so the same product cannot spend tokens twice. A valid delivery quarantined after a permanent Hooma HTTP rejection is automatically retried and blocks new audit claims until Hooma accepts it; corrupt/conflicting evidence remains visible for manual inspection without blocking unrelated products. Import jobs continue normally, and `HOOMA_WORKER_MODE=import` does not process or wait on the audit spool.

Provider HTTP failures stop the current job after recording the affected product, three consecutive invalid/refused model outputs trip a circuit breaker, and a completed analysis that Hooma permanently rejects is quarantined and stops the job immediately. This prevents a broken model name, schema, credential, or worker/API contract from consuming the entire catalog.

If the worker reports a quarantined entry, keep the file for investigation and fix the API/configuration cause before moving or removing it. The database's attempted/completed marker prevents that product from being charged for another audit while unrelated products continue.

The audit claim API also requires the protocol version built into this worker. During a production rollout, an older worker can still submit an already-started result, but it cannot claim another product. Stop the old process, update this folder from `main`, apply the accompanying Supabase migrations, and only then start `run.ps1` again.
