# Instagram publishing automation rollout

This rollout keeps Instagram OAuth/token maintenance independent from publishing.
Connecting `@hooma.ge` does not publish anything. Publishing requires every one
of the following to be true at request time:

- `HOOMA_SOCIAL_PUBLISHING_ENABLED=1`
- `HOOMA_INSTAGRAM_PUBLISHING_ENABLED=1`
- `HOOMA_INSTAGRAM_API_NETWORK_ENABLED=1`
- a single active encrypted `@hooma.ge` connection with the exact three scopes
- six exact immutable activation receipt hashes
- an `APPROVED_EXACT` job whose approval fingerprint still matches its content
- active product, cleared rights and visual claims, valid licensed premixed music
- exact staged video/cover hashes and an unexpired HTTPS signed media URL
- a clear bounded owned-media duplicate lookup and available publishing quota

Facebook sharing is hard-coded off. The provider request sends
`share_to_feed=true` and has no Facebook option.

## Production rollout order

1. Deploy with all network/publishing/insights flags still `0`.
2. Keep `HOOMA_INSTAGRAM_OAUTH_ENABLED=1` so the existing encrypted connection
   can refresh independently.
3. Set the endpoint, connection, identity, OAuth-scope and staging receipt hashes.
4. Set `HOOMA_SOCIAL_MEDIA_BASE_URL` to the exact HTTPS origin that serves the
   private bucket's signed URLs.
5. Enable only `HOOMA_INSTAGRAM_API_NETWORK_ENABLED=1` and run the read-only
   quota, identity, owned-media and status canary. Do not create a container.
6. Store the sanitized immutable canary receipt and set
   `INSTAGRAM_CANARY_RECEIPT_SHA256`.
7. Enable `HOOMA_INSTAGRAM_INSIGHTS_ENABLED=1`; publishing remains off.
8. Stage one exact licensed-music canary job, re-verify all hashes and obtain a
   fresh exact owner approval for that binary/caption/cover/schedule.
9. Only then set both publishing switches to `1`. Disable either switch to stop
   all new Instagram POST requests immediately.

## Scheduler and lifecycle

The authenticated `/api/cron/social-publish` route runs every 30 minutes using
48 once-daily Vercel schedules. It processes at most one due publishing job and
one due analytics snapshot per invocation.

Container creation and final `media_publish` are separate durable operations.
The exact intent is committed before each POST. Replaying an intent never grants
another POST. A lost/ambiguous response remains reconciliation-only, which
prevents blind duplicate uploads.

After a confirmed publish, insights are captured at T+2h, T+24h and T+72h.
Unavailable metrics remain `null`; the automation never deletes, boosts,
promotes or spends.
