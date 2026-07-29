# Hooma mobile application

Updated: 2026-07-30

## Outcome

`apps/mobile` is a real React Native application built with Expo Router and TypeScript. It does not render `hooma.ge` in a WebView. The app uses the existing Supabase project and the existing Next.js deployment as its trusted server boundary.

The dependency baseline is Expo SDK 56, React Native 0.85 and React 19.2. Expo SDK 56 is the latest release documented as stable at implementation time. Expo 57 packages were present on npm, but the official Expo SDK reference still identified SDK 56 as stable, so the app intentionally does not use SDK 57/pre-release APIs.

Official references:

- <https://docs.expo.dev/versions/latest/>
- <https://expo.dev/changelog/sdk-56>
- <https://docs.expo.dev/versions/v56.0.0/sdk/router/>
- <https://docs.expo.dev/guides/using-supabase/>
- <https://docs.expo.dev/guides/authentication/>
- <https://docs.expo.dev/build/eas-json/>

## Architecture

```text
Expo app
  ├── Supabase Auth with a SecureStore session adapter
  ├── public catalog reads through /api/mobile/v1
  ├── authenticated reads/mutations through a Supabase bearer token
  ├── TanStack Query cache, cancellation and retry
  ├── persisted Zustand cart (treated as untrusted by the server)
  └── BOG hosted checkout opened with Expo WebBrowser
                         │
                         ▼
Next.js /api/mobile/v1
  ├── verifies the Supabase access token with auth.getUser(token)
  ├── verifies active profile ↔ customer ownership
  ├── validates and rate-limits mutations
  ├── re-reads products, variants and prices
  └── calls the same checkout services/RPCs as the web storefront
                         │
                         ▼
Existing Supabase + BOG
  ├── authoritative price and delivery calculation
  ├── idempotency and first-10-unit reservation
  ├── signed BOG callback as the only paid authority
  └── existing orders, Hooma+, tracking and notifications
```

The web server action and mobile checkout route both call:

- `lib/commerce/catalog-checkout-service.ts`
- `lib/commerce/hooma-plus-checkout-service.ts`

The mobile request may send a displayed total only as a stale-cart check. The server resolves every item price, calculates delivery from the database-backed benefit summary, and passes the authoritative result into `begin_bog_checkout_v2`. A BOG success/universal link never marks an order paid; the mobile result screen polls the server until the signed callback changes the database status.

`BOG_PAYMENTS_ENABLED` and `HOOMA_PLUS_PAYMENTS_ENABLED` remain unchanged and must not be enabled without CEO approval.

## Mobile structure

```text
apps/mobile/
  app/
    (tabs)/                 home, shop, cart, orders, account
    auth/                   login, signup, reset, OAuth callback
    category/               category route
    checkout/               address + hosted BOG checkout
    product/                native product gallery/configurator
    order/                  detailed customer tracking timeline
    hooma-plus/             status, balance, plans, history
    mobile/                 BOG catalog/Hooma+ result routes
    legal/                  privacy and terms
    addresses.tsx
    assistant.tsx
    custom-orders.tsx
    how-to-order.tsx
    notifications.tsx
    onboarding.tsx
    search.tsx
    settings.tsx
  src/
    components/             accessible native design system
    lib/                    API, auth support, delivery, links, push
    providers/              Auth and TanStack Query providers
    stores/                 language/onboarding and persisted cart
  tests/                    delivery and deep-link boundary tests
  app.config.ts
  eas.json
  .env.example
```

The app is Georgian-first and includes English switching. Catalog browsing is public. Checkout, orders, addresses, Hooma+, custom orders, settings and notification registration require a valid session.

## Versioned mobile endpoints

Public:

- `GET /api/mobile/v1/home`
- `GET /api/mobile/v1/categories`
- `GET /api/mobile/v1/catalog`
- `GET /api/mobile/v1/catalog/[slug]`
- `POST /api/mobile/v1/assistant`

Authenticated:

- `GET /api/mobile/v1/session`
- `PATCH|DELETE /api/mobile/v1/profile`
- `GET|POST /api/mobile/v1/addresses`
- `POST /api/mobile/v1/checkout`
- `GET /api/mobile/v1/checkout/status`
- `GET /api/mobile/v1/orders`
- `GET /api/mobile/v1/orders/[id]`
- `GET|POST /api/mobile/v1/hooma-plus`
- `GET|PATCH /api/mobile/v1/notifications`
- `POST|DELETE /api/mobile/v1/push-token`
- `GET|POST /api/mobile/v1/custom-orders`
- `POST /api/mobile/v1/custom-orders/upload`
- `POST /api/mobile/v1/custom-orders/[id]/accept`

Infrastructure:

- `GET /api/cron/mobile-push` (requires `Authorization: Bearer $CRON_SECRET`)
- `GET /.well-known/apple-app-site-association`
- `GET /.well-known/assetlinks.json`
- `GET /mobile/payment/result`
- `GET /mobile/hooma-plus/result`

The checked-in Vercel schedule invokes mobile push once daily at `20:05 UTC`, which
keeps preview/production deployments compatible with the project's current Vercel
Cron plan. Before production push launch, either upgrade Vercel and change the
schedule to `*/5 * * * *`, or invoke the same protected endpoint every five
minutes from an approved scheduler. Until then, notifications remain immediately
available in the in-app inbox, while OS push delivery may be delayed.

## Migration

Apply only:

```text
supabase/migrations/20260730000100_mobile_app_foundation.sql
```

It adds:

- `mobile_push_tokens` with owner RLS and indexes;
- `mobile_push_deliveries` for trusted-server delivery attempts;
- `mobile_api_rate_limits` and the service-role-only atomic rate-limit RPC;
- `account_deletion_requests` and an authenticated deletion-request RPC;
- additive notification types, including Hooma+ expiry.

Do not paste a service-role key into the app. The bundle contains only the Supabase URL and publishable key.

Apply it from the repository root only after reviewing the dry run against the existing Hooma project:

```bash
pnpm exec supabase login
pnpm exec supabase link --project-ref YOUR_EXISTING_HOOMA_PROJECT_REF
pnpm db:push:dry-run
pnpm db:push
```

## Local commands

From the repository root:

```bash
corepack enable
pnpm install
cp apps/mobile/.env.example apps/mobile/.env
pnpm dev
pnpm mobile:start
```

The iOS Simulator cannot reach a server configured as `127.0.0.1` if the server is on another Mac. A physical phone must use an HTTPS development/staging URL or the Mac's LAN address for `EXPO_PUBLIC_API_URL`.

Verification:

```bash
pnpm mobile:typecheck
pnpm mobile:lint
pnpm mobile:test
pnpm test:mobile-api
pnpm test:payments
pnpm test:hooma-plus
pnpm test:assistant
pnpm mobile:doctor
pnpm build
```

Local native development builds:

```bash
pnpm --dir apps/mobile prebuild
pnpm mobile:ios
pnpm mobile:android
```

Validation on 2026-07-30 completed Expo Doctor (21/21), Expo prebuild, iOS and Android production JS/native-module bundles, all listed tests, and the existing Next.js production build. A local Xcode compile could not proceed because this Mac has system Ruby 2.6 without a compatible CocoaPods installation; Android Studio/JDK/SDK are not installed. Use the EAS development profiles below or install those native toolchains.

## Supabase Dashboard changes

Use the existing project.

1. Apply the additive migration.
2. Authentication → URL Configuration → Redirect URLs:
   - `hooma://auth/callback`
   - `hooma://auth/callback?mode=recovery`
   - `https://hooma.ge/auth/callback`
   - add development URLs only for controlled development builds.
3. Confirm Email provider and email confirmation are enabled.
4. Confirm Google provider uses the existing Supabase OAuth callback URL. No Google client secret belongs in the app.
5. Configure Apple provider after the Apple Service ID/key is created. Store the Apple private key only in Supabase Dashboard.
6. Keep RLS enabled. Do not grant client access to payment attempts, delivery reservations, rate-limit rows, push delivery rows or service-role functions.
7. Confirm the `custom-quote-files` private bucket and existing ownership policies are deployed.

Production redirect changes must be staged and tested with a development build before removing any existing web redirect.

## Apple Developer and iPhone testing

Before the first App Store record, confirm the permanent identifier. The current placeholder is `ge.hooma.app`.

Apple Developer:

1. Create/confirm App ID `ge.hooma.app`.
2. Enable Sign in with Apple, Associated Domains and Push Notifications.
3. Add `applinks:hooma.ge`.
4. Set `APPLE_TEAM_ID` and `HOOMA_IOS_BUNDLE_ID` in the Vercel environment so the association file returns the production App ID.
5. Create the Apple/Supabase Service ID and key for Sign in with Apple.
6. Configure APNs credentials in EAS; never commit `.p8`, `.p12` or provisioning files.

Simulator build:

```bash
cd apps/mobile
pnpm dlx eas-cli@latest login
pnpm dlx eas-cli@latest init
pnpm dlx eas-cli@latest build --platform ios --profile development-simulator
pnpm dlx eas-cli@latest build:run --platform ios --latest
```

Physical iPhone internal build:

```bash
cd apps/mobile
pnpm dlx eas-cli@latest device:create
pnpm dlx eas-cli@latest build --platform ios --profile development
```

Open the resulting EAS install link on the registered iPhone. OAuth, Apple sign-in, push notifications and universal links require a development build; Expo Go is not sufficient.

## Android and Google changes

1. Confirm permanent application ID `ge.hooma.app`.
2. Create/confirm the Google Play application.
3. Configure FCM V1 credentials in EAS for Expo push delivery.
4. Obtain SHA-256 fingerprints for development, preview and Play App Signing certificates.
5. Set comma-separated fingerprints in Vercel as `ANDROID_SHA256_CERT_FINGERPRINT`.
6. Verify `https://hooma.ge/.well-known/assetlinks.json` after deployment.
7. Add Google OAuth Android credentials only if a future native Google SDK replaces the current browser/Supabase PKCE flow.

Development APK:

```bash
cd apps/mobile
pnpm dlx eas-cli@latest build --platform android --profile development
```

Preview APK:

```bash
cd apps/mobile
pnpm dlx eas-cli@latest build --platform android --profile preview
```

Production AAB (build only; do not submit without CEO approval):

```bash
cd apps/mobile
pnpm dlx eas-cli@latest build --platform android --profile production
```

## Deployment environment

Server/Vercel:

```text
CRON_SECRET
EXPO_ACCESS_TOKEN                  optional Expo push enhanced security
APPLE_TEAM_ID
HOOMA_IOS_BUNDLE_ID
HOOMA_ANDROID_APPLICATION_ID
ANDROID_SHA256_CERT_FINGERPRINT
```

EAS public environment:

```text
EXPO_PUBLIC_API_URL=https://hooma.ge
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
EXPO_PUBLIC_EAS_PROJECT_ID=...
EXPO_OWNER=...
```

No BOG, OpenAI, service-role, Apple private, APNs or FCM secret may use an `EXPO_PUBLIC_` name.

## Threat review

- Tokens are verified server-side with Supabase `auth.getUser`, then profile/customer ownership is rechecked.
- Mobile mutation routes are input-limited and use a database-backed atomic rate limiter.
- Catalog and order reads are explicitly filtered by the authenticated customer/profile.
- File uploads use short-lived signed upload tokens, owner/request path validation, file-count/type/size checks and a post-upload object check.
- Cart prices are display snapshots only; the checkout service re-reads audited active products and resolved prices.
- Delivery benefits are calculated from the database. Failed/rejected payment handling remains in the existing BOG callback/RPC flow.
- BOG redirects are constrained to `https://payment.bog.ge`; only a signed callback can set `paid`.
- Push sending runs only from the CRON-secret-protected server route.
- Logs must contain IDs/error codes only, never access tokens, push tokens, addresses or payment data.

## Known external blockers

- EAS/Expo account and project ID are required for cloud builds.
- This Mac needs Ruby 3 + CocoaPods for a local iOS compile, or the EAS simulator profile.
- This Mac needs Android Studio, JDK 17 and the Android SDK for a local Android compile, or the EAS development profile.
- Apple Developer membership/device registration is required for a physical iPhone build.
- APNs and FCM V1 credentials are required for production push.
- Near-real-time OS push requires a Vercel plan that permits a five-minute cron
  schedule, or an approved external scheduler calling the protected endpoint.
- Supabase redirect allow-list and Apple provider configuration require Dashboard access.
- The universal/app association environment values require Vercel deployment.
- Live BOG and Hooma+ flags intentionally remain disabled pending separate CEO approval.
- Store submission and publication require separate approval.

See `docs/mobile-store-submission-checklist.md` before any store upload.
