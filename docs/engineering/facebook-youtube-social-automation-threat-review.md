# Facebook and YouTube social automation — threat review

Reviewed: 2026-08-30

## Scope and isolation

This change adds separate Facebook Page Reels and YouTube Shorts providers to
Hooma's server-only social automation. It does not turn Instagram's
`shareToFacebook` option on, modify the approved Instagram/TikTok campaign,
insert publish jobs, or enable any provider/network/publishing switch.

The only remote mutations implemented are Facebook Reel creation/upload and
YouTube resumable video upload. Neither provider exposes delete, edit, comment,
boost, promote, advertising, spend, or cross-post operations.

## Activation boundary

OAuth, provider network access, insights, and publishing have independent
environment gates, all defaulting to off. Facebook publishing additionally
requires an immutable app-review receipt whose exact SHA-256 is configured;
YouTube publishing requires the corresponding immutable YouTube API audit
receipt. Both also require the global social-publishing gate.

An OAuth connection is accepted only when the provider returns the exact
configured `@hooma.ge` Page/channel identity and the exact least-privilege scope
set. OAuth state is single-use, stored server-side, time-bounded, and tied to an
HttpOnly browser cookie; YouTube also uses S256 PKCE and offline access. Tokens
are encrypted in the existing connection store and are never returned to the
browser, audit log, receipt ledger, URL, or exception message.

## Publish gates and idempotency

Immediately before any provider mutation, the worker re-checks:

- the exact account identity, active product, schedule window, and an
  unexpired connection;
- the current `APPROVED_EXACT` fingerprint and exact asset/audio/caption/cover
  hashes;
- a Hooma-owned licensed master with immutable music evidence;
- technical video properties, rights/claims clearance, and a passing remote
  duplicate scan;
- the provider-specific network, review/audit, publishing, and global kill
  switches.

The staged source is downloaded and SHA-256/size verified before upload. A
durable database intent is recorded before the first remote mutation. Once a
remote side effect may have occurred, a retry is reconciliation-only; an
ambiguous provider response cannot trigger a blind second upload. Lifecycle
state is service-role-only behind forced RLS, indexed by provider/job identity,
and preserves remote IDs without provider bodies or credentials.

Facebook upload authentication is sent only to the pinned
`https://rupload.facebook.com` origin. Graph calls use the configured Meta API
version. YouTube resumable-session URLs are accepted only on the exact Google
upload origin. Redirects are rejected at credential-bearing boundaries.

## Media and policy behavior

Both providers require 1080x1920 H.264 CFR30 yuv420p video with audible licensed
audio. Facebook accepts 4–60 seconds; YouTube accepts 4–180 seconds. YouTube
uploads are public, do not notify subscribers, are marked as containing
synthetic media, and are not marked as made for children. Facebook and YouTube
remain separate accounts; Instagram Share to Facebook remains off.

## Tokens, analytics, and rollback

YouTube's short-lived access token is refreshed under a database lease both by
the maintenance cron and on demand immediately before publishing/analytics.
Refresh rotation is versioned so overlapping executions cannot overwrite a
newer token. Authentication failures deactivate the connection; transient
failures do not.

Analytics is GET-only and writes immutable T+2h, T+24h, and T+72h snapshots.
Unavailable metrics are stored as `null`, never fabricated as zero. Analytics
cannot mutate or promote content.

New external calls can be stopped independently with each provider's network
gate. New uploads can be stopped with a provider publishing gate or the global
social-publishing gate while retaining encrypted connection evidence and
published-content reconciliation data.

## Production authorization blockers

Publishing must remain disabled until all of the following are complete:

1. An authorized Hooma administrator completes Meta OAuth for the exact
   `@hooma.ge` Facebook Page and Google OAuth for the exact Hooma YouTube
   channel.
2. Meta grants the requested Page permissions and the approved decision is
   retained as a redacted immutable receipt with its SHA-256 configured.
3. Google's OAuth consent/app configuration and YouTube API audit are complete;
   the redacted immutable audit receipt and its SHA-256 are configured.
4. The stored connection receipts and granted scopes are reviewed without
   exposing tokens.
5. A non-publishing identity/status canary succeeds for each provider.
6. Giorgi gives fresh, exact approval for the first Facebook and YouTube publish
   jobs after their final media fingerprints are known.

## Documentation reviewed

- Meta Facebook Reels Publishing API:
  `https://www.postman.com/meta/facebook/documentation/r56bjfd/facebook-api`
- Meta Reels Publishing API sample:
  `https://github.com/fbsamples/reels_publishing_apis`
- YouTube Data API `videos.insert`:
  `https://developers.google.com/youtube/v3/docs/videos/insert`
- Google OAuth 2.0 for web server applications:
  `https://developers.google.com/youtube/v3/guides/auth/server-side-web-apps`
- YouTube altered/synthetic content metadata:
  `https://support.google.com/youtube/answer/15424877`
