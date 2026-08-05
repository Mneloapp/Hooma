# Hooma

Hooma is a Georgian-first ecommerce system for useful objects manufactured on demand with 3D printing.

## Stack

- Next.js 15 App Router, TypeScript, React, Tailwind CSS
- Supabase Postgres, Auth, Storage, and RLS
- Vercel
- Bambu Lab production adapter planned behind operator approval
- Bank of Georgia hosted checkout for automatic full-payment catalog orders

## Local development

```bash
pnpm install
pnpm dev
```

Required environment variables:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
CRON_SECRET=
GOOGLE_CLOUD_TRANSLATION_API_KEY=
OPENAI_API_KEY=
HOOMA_ASSISTANT_MODEL=gpt-5-mini
HOOMA_ASSISTANT_RATE_LIMIT_SECRET=
HOOMA_CONTACT_ENABLED=false
RESEND_API_KEY=
HOOMA_CONTACT_FROM_EMAIL=Hooma Website <support@hooma.ge>
HOOMA_CONTACT_RATE_LIMIT_SECRET=
BOG_PAYMENTS_ENABLED=false
BOG_CUSTOMER_REFUNDS_ENABLED=false
HOOMA_PLUS_PAYMENTS_ENABLED=false
BOG_CLIENT_ID=
BOG_CLIENT_SECRET=
BOG_PAYMENT_METHODS=card
BOG_CALLBACK_PUBLIC_KEY=
```

`SUPABASE_SECRET_KEY` is server-only. Never expose it through a `NEXT_PUBLIC_` variable.
`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` enables the customer delivery-location picker. Restrict this browser key to the Maps JavaScript API and Hooma's HTTPS origins in Google Cloud Console. See [`docs/google-maps-location-picker.md`](docs/google-maps-location-picker.md) for the required billing, API, website-restriction, and Vercel setup.
`CRON_SECRET` protects the daily-deal rotation endpoint. See `docs/daily-deals.md` for the 100-product, 50%-off rotation rules.
`GOOGLE_CLOUD_TRANSLATION_API_KEY` is also server-only. It enables authenticated Catalog Clipper imports to translate product names and descriptions into Georgian through the [Cloud Translation API](https://cloud.google.com/translate); never add it to the extension or a `NEXT_PUBLIC_` variable. Hooma's admin import UI identifies automatic results as powered by Google Translate and requires operator review before publication.
`OPENAI_API_KEY` is server-only and enables non-template storefront-assistant answers. Common approved FAQ answers remain available without a model call. `HOOMA_ASSISTANT_MODEL` defaults to `gpt-5-mini`; use a separate OpenAI project/key and project spend limit for the public assistant. `HOOMA_ASSISTANT_RATE_LIMIT_SECRET` is optional but recommended so rate-limit identifiers remain independent from API-key rotation.
`RESEND_API_KEY` enables the general `/contact` support form and must remain server-only. Use a dedicated Resend sending-only key; Supabase Auth's SMTP configuration is separate and is not available to the Next.js app. Apply the contact migration first, configure `HOOMA_CONTACT_FROM_EMAIL` with a verified Hooma sender, add a dedicated `HOOMA_CONTACT_RATE_LIMIT_SECRET`, then set `HOOMA_CONTACT_ENABLED=true`. See [`docs/contact-support.md`](docs/contact-support.md).
`BOG_CLIENT_ID` and `BOG_CLIENT_SECRET` are server-only. New live payment sessions remain fail-closed until `BOG_PAYMENTS_ENABLED=true`; customer-initiated pre-production refunds and Hooma+ each require their independent `BOG_CUSTOMER_REFUNDS_ENABLED=true` and `HOOMA_PLUS_PAYMENTS_ENABLED=true` switches. Keep the refund switch false until its migration and BOG full-refund acceptance tests pass. Start with `BOG_PAYMENT_METHODS=card` and add wallets only after bank activation. See `docs/bog-payments.md` for rollout, callback security, cancellation/refund rules, delivery pricing, and incident steps.

Apply Supabase migrations in chronological order from `supabase/migrations`.

## Current milestone

- New 3D-print product category tree
- Georgian-first storefront and catalog preview
- Cart and BOG hosted full-payment checkout
- Server-authoritative delivery fees, first-10-unit benefit, and prepaid Hooma+
- Admin import inbox and production queue
- Authenticated custom-part file upload and individual quote workflow
- Admin-only manual product Draft creation, material/time costing, margin calculator, and universal Catalog Clipper JSON import
- Source-license, production, tracking, payment, and audit database foundation
- Server-authoritative live order pricing and signed BOG payment reconciliation

See `docs/hooma-commerce-v1.md` for architecture and rollout stages.
