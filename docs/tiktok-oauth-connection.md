# TikTok owned-account OAuth connection

This change prepares an owner-only OAuth connection for Hooma's TikTok API for
Business Accounts API app. It does not implement publishing and it does not
enable social publishing.

## Activation gates

Keep both switches off during deployment:

```dotenv
HOOMA_SOCIAL_PUBLISHING_ENABLED=0
HOOMA_TIKTOK_OAUTH_ENABLED=0
TIKTOK_BUSINESS_APP_REVIEW_STATUS=PENDING
TIKTOK_BUSINESS_APP_REVIEW_RECEIPT_SHA256=
TIKTOK_BUSINESS_OAUTH_CONNECTION_RECEIPT_SHA256=
TIKTOK_BUSINESS_ORGANIC_ACTIVATION_RECEIPT_SHA256=
```

Activate the OAuth switch only after all of the following are true:

1. TikTok has approved the existing Hooma developer app. A sanitized immutable
   receipt of that portal decision must be stored outside the repository and
   its SHA-256 placed in `TIKTOK_BUSINESS_APP_REVIEW_RECEIPT_SHA256`. Set
   `TIKTOK_BUSINESS_APP_REVIEW_STATUS=APPROVED` only for that exact receipt.
2. The registered TikTok account-holder callback is exactly
   `https://hooma.ge/api/social/oauth/tiktok/callback/`, including the final
   slash.
3. `TIKTOK_BUSINESS_APPROVED_SCOPES` is exactly the reviewed Accounts API set
   frozen below. Any added or removed scope fails closed and requires a code,
   schema, and approval review.
4. `TIKTOK_BUSINESS_CLIENT_ID` is exactly the approved application ID
   `7675794584770248724`. The production secret store contains its matching
   secret. Never put the secret in the repository, build logs, tickets, or
   receipts.
5. Giorgi gives fresh action-time approval to connect the owned `@hooma.ge`
   account.

The account-holder authorization request and token exchange stay on the same
TikTok API for Business Accounts API stack. Authorization uses
`https://ads.tiktok.com/marketing_api/auth` with `app_id`, the frozen scope
list, the exact callback, and one-time state. Its success callback returns
`auth_code`, which is exchanged only at `/tt_user/oauth2/token/`. The separate
TikTok for Developers Login Kit `v2/auth/authorize` flow returns `code` and
must never be mixed with the Accounts API token endpoint. The returned token
scope set is checked again before any credential can be stored.

## Production values

Non-secret fixed values:

```dotenv
TIKTOK_BUSINESS_AUTH_URL=https://ads.tiktok.com/marketing_api/auth
TIKTOK_BUSINESS_CLIENT_ID=7675794584770248724
TIKTOK_BUSINESS_REDIRECT_URI=https://hooma.ge/api/social/oauth/tiktok/callback/
TIKTOK_BUSINESS_EXPECTED_USERNAME=hooma.ge
TIKTOK_BUSINESS_APPROVED_SCOPES=user.info.basic,user.info.username,user.info.stats,user.info.profile,user.account.type,user.insights,video.publish,video.upload,video.list,video.insights
```

Secret or approval-derived values must be supplied through the production
secret manager. The first receipt is written only after owned-account OAuth
returns the exact `@hooma.ge` identity, frozen scope set and token expiry. The
second is the hash of a separate redacted Organic Accounts activation review
artifact:

```dotenv
TIKTOK_BUSINESS_CLIENT_SECRET=
TIKTOK_BUSINESS_OAUTH_CONNECTION_RECEIPT_SHA256=
TIKTOK_BUSINESS_ORGANIC_ACTIVATION_RECEIPT_SHA256=
```

The activation receipt is not a self-hash of the activation object. After
configuration is verified, set `HOOMA_TIKTOK_OAUTH_ENABLED=1` to expose
the owner-only connect action and keep it on while the connection is active so
token maintenance can run. Leave `HOOMA_SOCIAL_PUBLISHING_ENABLED=0` until the
independent publishing, music-receipt, idempotency, and approval gates are all
accepted.

The developer portal showed `Hooma Organic Publisher` as **Approved** on
2026-08-20. This observation resolves the review-status blocker only. It does
not replace the sanitized receipt hash, owned-account authorization, exact
token scope check, or any publishing gate.

The same TikTok OAuth gate enables token maintenance without enabling content
publishing. TikTok access tokens expire after roughly one day, so the existing
authenticated social-token cron can claim due TikTok connections and exchange
their encrypted refresh token. The returned account ID and exact approved scope
set are revalidated, the owned-account identity is fetched again, and both
returned tokens are persisted through the existing atomic rotation path. The
old refresh token is never reused after TikTok returns a replacement.

The Hooma Vercel team is on Hobby. A single expression that runs more than once
per day is rejected on that plan, so `vercel.json` deliberately uses six
distinct once-daily entries for the same authenticated route: 00:15, 04:15,
08:15, 12:15, 16:15, and 20:15 UTC. Vercel supports multiple schedules for one
API path. Hobby's within-the-hour execution precision makes the effective
worst-case gap about five hours, which remains inside the existing six-hour
TikTok refresh margin.

Every invocation uses the same authenticated, idempotent refresh route. Due
connections are claimed with a short database lease, and completion is bound
to both the lease ID and token version. Delayed or overlapping schedule
invocations therefore cannot rotate the same connection concurrently. A
successful production invocation must still be observed before enabling
TikTok OAuth.

The Organic Accounts adapter independently fails closed when the activation's
recorded access-token expiry has ten minutes or less remaining, and it rechecks
that condition before every operation. A future publishing worker must lease
and refresh the stored connection, revalidate identity and exact scopes, and
mint a fresh activation receipt before retrying; it must never call TikTok with
the stale activation.

## Threat review

- **Wrong account:** identity lookup must return the token's exact `business_id`
  and normalized username `hooma.ge`; any other account fails closed before
  storage.
- **State fixation or callback replay:** OAuth state is random, hashed in the
  database, bound to the owner and provider, mirrored in an HTTP-only secure
  cookie, expires quickly, and is consumed once.
- **Redirect mismatch:** configuration accepts only the canonical Hooma origin
  and the exact trailing-slash callback. The same value is sent during both
  authorization and token exchange.
- **Wrong authorization surface:** configuration accepts only the API for
  Business account-holder URL `https://ads.tiktok.com/marketing_api/auth`.
  The TikTok for Developers Login Kit endpoint is rejected because it returns
  a different callback and token contract. Success callbacks accept one
  bounded `auth_code` value and reject duplicated state or authorization-code
  parameters.
- **Permission drift:** human labels are never mapped to guessed scope strings.
  Returned machine identifiers must contain the frozen approval-derived set.
- **Token disclosure:** token responses are never logged. Access and refresh
  tokens pass directly into the existing AES-256-GCM envelope storage path.
- **Refresh-token rotation:** every refresh must return a complete token pair,
  the same app-specific account ID, and the frozen approved scopes. The worker
  stores TikTok's returned refresh token and increments the database token
  version atomically; identity or scope drift fails the leased claim.
- **Unauthorized operator:** both start and callback routes require an
  authenticated Hooma owner with `team.manage` permission.
- **Accidental publication:** OAuth has an independent switch and connecting an
  account does not turn on publishing. The publishing switch remains off by
  default.
- **Forged activation:** the Organic Accounts adapter requires the exact
  approved app ID, app-review receipt, active verified OAuth-connection receipt,
  complete activation receipt, exact returned scope set, and more than ten
  minutes of recorded access-token lifetime. It re-evaluates environment gates
  at operation time; SHA-shaped substitutes do not enable network I/O.

## Verification

Run `npm run test:social:tiktok` and a production build. Then verify that the
admin settings page shows TikTok as unavailable while the OAuth switch is off,
without exposing any application identifiers or secrets.

Before rollout, verify that production accepts all six Hobby-compatible daily
schedules and that the authenticated route completes successfully. Keep TikTok
OAuth disabled until that evidence exists. Publishing remains independently
disabled until a worker can perform a leased near-expiry refresh and create a
current, receipt-bound activation.

Official references:

- [TikTok API for Business endpoint index](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&language=ENGLISH)
- [Obtain a short-term access token](https://business-api.tiktok.com/gateway/docs/index?doc_id=1833997638479041&language=ENGLISH)
