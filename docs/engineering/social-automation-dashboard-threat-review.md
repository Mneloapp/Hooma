# Social automation dashboard threat review

## Scope

`/admin/automations` is the owner-only, server-rendered control room for Hooma's TikTok and Instagram organic automation. It may start an owner OAuth flow, but it cannot publish, delete, boost, promote, spend, approve content, or change a kill-switch.

## Protected assets

- Provider access and refresh tokens
- External account, post, publish, and request identifiers
- Media object paths, captions, hashes, approval fingerprints, and raw provider payloads
- Supabase secret-key access

## Controls

- Middleware maps the route to `team.manage`; the page repeats the permission check and requires the immutable `owner` role before creating a service client.
- The data loader is server-only and selects a narrow allowlist. Secret envelopes and external identifiers are never queried.
- Job identifiers are used only in server memory to join receipts to a provider and are stripped before returning the view model.
- Analytics payloads are reduced to a numeric allowlist. Missing metrics remain `null`, never a fabricated zero.
- Receipt and audit event names are mapped to fixed Georgian labels; unknown event strings and raw payloads are not rendered.
- Environment gates are converted to booleans on the server. Environment names and values are not serialized into client code.
- OAuth uses plain anchors so Next.js prefetch cannot accidentally start an authorization flow. The existing OAuth routes repeat owner authorization and one-time-state checks.
- The page contains no mutation form, Server Action, publish control, destructive control, or cross-post control.

## Stage separation

Provider application approval, owned-account OAuth, and publishing enablement are shown as three independent stages. Application approval never implies account authorization, and neither stage enables publishing. TikTok is shown as approved only when the shared configuration gate validates both the approved status and its SHA-256 receipt; the dashboard does not invent a review timestamp.

## Failure behavior

Missing service configuration or social tables produces an unavailable state and warning. Publishing remains fail-closed. Missing staging, approval, music, rights, visual, duplicate, identity, or deadline evidence is displayed as a blocker.

## Residual risks

- If TikTok later revokes the application, removing either the approved status or its receipt makes the dashboard state unknown and disables OAuth. Revocation cannot enable publishing because OAuth, network, provider, global, job, and exact-approval gates are separate.
- The dashboard relies on database trigger invariants for music-receipt validity; it intentionally does not display or re-parse the receipt body.
- Service-role reads make the repeated owner authorization check security-critical and covered by a focused static regression test.
