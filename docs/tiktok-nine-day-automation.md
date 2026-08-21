# TikTok nine-day owned-master automation

The 2026-08-22 campaign reuses the nine exact binaries already approved for
Instagram while assigning new TikTok post and idempotency identities. It never
reuses a deleted or historical TikTok post.

## Launch order

1. Apply and verify the additive TikTok lifecycle/analytics migration while
   TikTok publishing stays disabled.
2. Deploy the application with TikTok network reads enabled and TikTok
   publishing disabled.
3. Run the owner-only read-only canary. It validates the active `@hooma.ge`
   connection, exact scopes, activation receipts, endpoint schema and bounded
   owned-post duplicate lookup.
4. The owner launches the nine exact campaign rows. Each row re-checks the
   product, private staged video and cover hashes, exact caption, rights,
   immutable licensed pre-mixed music receipt and approval fingerprint.
5. Enable the provider publishing switch only after all nine rows show
   `APPROVED_EXACT`.

## Publish and analytics safety

- The worker checks the owned-post list before every first dispatch.
- A publish intent is stored before the remote mutation. An ambiguous first
  dispatch is never retried automatically.
- Accepted remote publishes are polled until a final TikTok post ID and URL are
  stored.
- Analytics snapshots run at T+2h, T+24h and T+72h. Unavailable metrics remain
  `null`; real zero values remain zero.
- Silent publishing, Facebook sharing, ads-only uploads, drafts, boosts,
  deletion and historical re-upload are disabled.
