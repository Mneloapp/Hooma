# Hooma

Hooma is a Georgian-first ecommerce system for useful objects manufactured on demand with 3D printing.

## Stack

- Next.js 15 App Router, TypeScript, React, Tailwind CSS
- Supabase Postgres, Auth, Storage, and RLS
- Vercel
- Bambu Lab production adapter planned behind operator approval
- TBC Bank or Bank of Georgia payment integration deferred until the complete test-order workflow is verified

## Local development

```bash
pnpm install
pnpm dev
```

Required environment variables for persisted test orders:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=
```

`SUPABASE_SECRET_KEY` is server-only. Never expose it through a `NEXT_PUBLIC_` variable.
`CRON_SECRET` protects the daily-deal rotation endpoint. See `docs/daily-deals.md` for the 100-product, 50%-off rotation rules.

Apply Supabase migrations in chronological order from `supabase/migrations`.

## Current milestone

- New 3D-print product category tree
- Georgian-first storefront and catalog preview
- Cart and test checkout shell
- Admin import inbox and production queue
- Authenticated custom-part file upload and individual quote workflow
- Admin-only manual product Draft creation, material/time costing, margin calculator, and universal Catalog Clipper JSON import
- Source-license, production, tracking, payment, and audit database foundation
- Server-authoritative test order validation

See `docs/hooma-commerce-v1.md` for architecture and rollout stages.
