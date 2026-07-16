# Hooma Engineering Rules

## Product direction

Hooma is a Georgian, design-led ecommerce brand for useful objects manufactured on demand with 3D printing. Customers shop products, not files or printer technology. The storefront should feel calm, premium, clear, and trustworthy.

The initial operational promise is dispatch or delivery preparation within three business days. A human operator remains in the loop while catalog ingestion, slicing, printer dispatch, quality control, and tracking are progressively automated.

## Roles

- Giorgi Devdariani is CEO and approves commercial, brand, pricing, payment-provider, and launch decisions.
- Codex owns product design, UX, engineering, architecture, implementation, verification, and technical recommendations.

## Stack

- Next.js App Router, TypeScript, React, Tailwind CSS
- Supabase Postgres, Auth, Storage, and Row Level Security
- Vercel deployment
- Bambu Lab integration is isolated behind a production adapter and must never be called from browser code.
- TBC Bank or Bank of Georgia payments are a later production milestone. Until CEO approval, payment mode stays `test` and no live bank credentials or endpoints are added.

## Non-negotiable rules

- Never trust product names, prices, totals, inventory, or payment status submitted by the browser. Re-read authoritative data server-side.
- Never expose Supabase service-role keys, bank secrets, printer credentials, MQTT credentials, access codes, or camera feeds to client components.
- Every admin mutation must verify an authenticated admin on the server and create an audit event.
- Every public product imported from MakerWorld or another source must have an explicit, verified commercial-use license or documented creator permission before publication.
- Store source attribution and source URL internally. Do not copy descriptions, images, or files when their license does not permit it.
- Printer dispatch is operator-approved in V1. No paid order may start printing automatically until idempotency, capacity checks, plate validation, and an emergency stop path exist.
- Bank webhooks must be signature-verified, idempotent, and the only authority that can mark a payment as paid.
- Preserve user changes and use feature branches. Do not commit secrets or local environment files.

## UX principles

- Georgian-first, with English support.
- Category and subcategory navigation must work well on mobile.
- Show delivery promise, material, dimensions, intended use, care/safety notes, and production status clearly.
- Do not make the customer reason about STL files, slicing, plates, or printer queues.
- Order tracking uses customer-friendly states: Order received, Confirmed, In production, Quality check, Ready for delivery, Out for delivery, Delivered.

## Definition of done

- TypeScript and production build pass.
- Desktop and mobile layouts are checked.
- Empty, loading, error, and permission states are handled.
- Database changes are additive migrations with RLS and indexes.
- Security-sensitive changes include a short threat review in the PR or engineering notes.

