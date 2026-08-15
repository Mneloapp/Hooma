# TikTok owned-account OAuth connection

This change prepares an owner-only OAuth connection for Hooma's TikTok API for
Business Accounts API app. It does not implement publishing and it does not
enable social publishing.

## Activation gates

Keep both switches off during deployment:

```dotenv
HOOMA_SOCIAL_PUBLISHING_ENABLED=0
HOOMA_TIKTOK_OAUTH_ENABLED=0
```

Activate the OAuth switch only after all of the following are true:

1. TikTok has approved the existing Hooma developer app.
2. The registered TikTok account-holder callback is exactly
   `https://hooma.ge/api/social/oauth/tiktok/callback/`, including the final
   slash.
3. `TIKTOK_BUSINESS_APPROVED_SCOPES` contains only the exact comma-separated
   machine identifiers returned for the approved app. Do not derive these
   values from human-readable permission labels in the developer portal.
4. The production secret store contains the app ID and secret. Never put those
   values in the repository, build logs, tickets, or receipts.
5. Giorgi gives fresh action-time approval to connect the owned `@hooma.ge`
   account.

The authorization request intentionally omits a `scope` query parameter. TikTok
then grants the app's approved permissions, and the token response is checked
against the frozen exact identifiers before any credential can be stored.

## Production values

Non-secret fixed values:

```dotenv
TIKTOK_BUSINESS_AUTH_URL=https://ads.tiktok.com/marketing_api/auth
TIKTOK_BUSINESS_REDIRECT_URI=https://hooma.ge/api/social/oauth/tiktok/callback/
TIKTOK_BUSINESS_EXPECTED_USERNAME=hooma.ge
```

Secret or approval-derived values must be supplied through the production
secret manager:

```dotenv
TIKTOK_BUSINESS_CLIENT_ID=
TIKTOK_BUSINESS_CLIENT_SECRET=
TIKTOK_BUSINESS_APPROVED_SCOPES=
```

After configuration is verified, set `HOOMA_TIKTOK_OAUTH_ENABLED=1` to expose
the owner-only connect action. Leave `HOOMA_SOCIAL_PUBLISHING_ENABLED=0` until
the independent publishing, music-receipt, idempotency, and approval gates are
all accepted.

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
- **Permission drift:** human labels are never mapped to guessed scope strings.
  Returned machine identifiers must contain the frozen approval-derived set.
- **Token disclosure:** token responses are never logged. Access and refresh
  tokens pass directly into the existing AES-256-GCM envelope storage path.
- **Unauthorized operator:** both start and callback routes require an
  authenticated Hooma owner with `team.manage` permission.
- **Accidental publication:** OAuth has an independent switch and connecting an
  account does not turn on publishing. The publishing switch remains off by
  default.

## Verification

Run `npm run test:social:tiktok` and a production build. Then verify that the
admin settings page shows TikTok as unavailable while the OAuth switch is off,
without exposing any application identifiers or secrets.

Official references:

- [TikTok API for Business endpoint index](https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521&language=ENGLISH)
- [Obtain a short-term access token](https://business-api.tiktok.com/gateway/docs/index?doc_id=1833997638479041&language=ENGLISH)
