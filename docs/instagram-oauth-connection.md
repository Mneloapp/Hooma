# Instagram owned-account connection and token maintenance

Instagram OAuth, token maintenance, and content publishing have independent
activation gates. Connecting the owned `@hooma.ge` account must never enable a
publish action.

## Production gates

Keep publishing off while retaining the connected account:

```dotenv
HOOMA_INSTAGRAM_OAUTH_ENABLED=1
HOOMA_INSTAGRAM_PUBLISHING_ENABLED=0
HOOMA_SOCIAL_PUBLISHING_ENABLED=0
```

`HOOMA_INSTAGRAM_OAUTH_ENABLED=1` exposes the owner-only Instagram connect flow
and lets the authenticated `/api/cron/social-tokens` route claim due Instagram
token refreshes. It does not authorize content publishing.

Future Instagram publishing must require both
`HOOMA_INSTAGRAM_PUBLISHING_ENABLED=1` and
`HOOMA_SOCIAL_PUBLISHING_ENABLED=1`, in addition to the exact post approval,
music-license receipt, media hashes, availability, identity, idempotency, and
remote-duplicate gates. No Instagram publishing adapter is registered by this
change.

## Migration-safe rollout

The existing production connection was created while the legacy global switch
also gated Instagram OAuth. To avoid stranding that encrypted token during a
deployment, an absent `HOOMA_INSTAGRAM_OAUTH_ENABLED` temporarily inherits the
legacy `HOOMA_SOCIAL_PUBLISHING_ENABLED` value. An explicit value always wins,
and every value other than `1` fails closed.

Roll out in this order:

1. Add `HOOMA_INSTAGRAM_OAUTH_ENABLED=1` in Production.
2. Add `HOOMA_INSTAGRAM_PUBLISHING_ENABLED=0` in Production.
3. Deploy this change and verify the owner settings still show `@hooma.ge` as
   connected.
4. Set `HOOMA_SOCIAL_PUBLISHING_ENABLED=0` in Production and redeploy.
5. Invoke the authenticated token cron only as a read/maintenance canary; it
   must report no publish action and must not expose token material.

Do not remove the legacy fallback until the dedicated OAuth gate is verified in
Production. Never record access tokens, authorization codes, client secrets, or
cookies in logs or rollout receipts.

## Refresh behavior

Vercel invokes `/api/cron/social-tokens` daily at 03:15 UTC. The route requires
the exact `Authorization: Bearer <CRON_SECRET>` header, claims due connections
under a short database lease, refreshes the long-lived Instagram token,
revalidates both the professional account ID and app-scoped ID namespace, and
atomically rotates the encrypted token envelope. Authentication drift marks the
connection for reauthorization; transient failures remain retryable.

The daily cadence is sufficient for the current Instagram refresh window,
which is scheduled well before token expiry. Unavailable metrics or refresh
claims are not treated as zero or success.

## Verification

Run:

```sh
npm run test:social:instagram
npm run test:social:tiktok
npm run build
```

Then confirm that the production environment contains the two dedicated
Instagram gate names, without reading or exporting their values, and that no
Instagram publishing route or adapter was introduced by this change.
