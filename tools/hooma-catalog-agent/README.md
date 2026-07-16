# Hooma Catalog Agent · Windows V1

This worker receives a whole catalog category from Hooma, discovers its product pages, runs the same extraction engine as the Hooma Catalog Clipper, and sends reviewed data back as private Drafts.

## Security model

- The worker receives a revocable `hooma_ca_...` token, never a Supabase secret.
- The token can only claim assigned jobs and create Draft results.
- Publishing, deleting products, pricing settings, users, orders, and production are unavailable.
- Hooma validates the job category, source host, pricing profile, material profile, product limits, and idempotency server-side.
- The worker stops and reports an error when a source requests CAPTCHA or human verification. It does not bypass access controls.

## Windows setup

1. Install current Node.js LTS and Google Chrome.
2. Open PowerShell in `tools\hooma-catalog-agent`.
3. Run `powershell -ExecutionPolicy Bypass -File .\install.ps1`.
4. In Hooma Admin → Catalog Agent, register `Hooma Catalog Agent · Windows 01`.
5. Copy the one-time token into `.env` as `HOOMA_AGENT_TOKEN`.
6. Set `HOOMA_BASE_URL` to the active Vercel deployment.
7. Run `powershell -ExecutionPolicy Bypass -File .\run.ps1`.

Chrome opens with a dedicated profile in `.hooma-browser-profile`. Keep this window available to the worker. If the source asks for a normal consent, login, or verification step, complete it in that browser and restart the job. A failed job can be recreated from the Hooma admin page.

## Job flow

1. Owner registers the agent and receives a one-time token.
2. Catalog staff submits a category URL, Hooma category, and maximum product count.
3. The worker discovers and deduplicates product URLs.
4. Each page is processed with `../hooma-catalog-clipper/extractor.js`.
5. Complete records become `products.status = draft`.
6. Records missing name, description, media, material, weight, or print time go to Import Review.
7. Only Owner/Admin can publish products through the existing publication workflow.

