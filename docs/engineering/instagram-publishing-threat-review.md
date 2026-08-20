# Instagram publishing automation — threat review

## Remote side effects

Only `InstagramReelsPublishClient` implements mutations, limited to Meta's Reel
container-create and `media_publish` endpoints. It has no delete, comment,
Facebook-share, boost, promote, advertising or spend method. The client needs
valid immutable activation evidence, caller opt-in, the Instagram network flag,
the provider publishing flag and the global publishing flag.

Each remote boundary is preceded by a database intent. The first exact intent
may dispatch once; every replay is reconciliation-only. A network or database
failure after dispatch is treated as remotely uncertain and cannot cause a
blind second POST. A lost container-create result requires manual reconciliation
because Meta exposes no safe transactional lookup for the lost container ID.

## Credentials and evidence

Access tokens remain encrypted in `social_connections`, are decrypted only in
server memory and are sent only to `https://graph.instagram.com/v25.0`. Fetch
redirects are rejected. Tokens are redacted before request hashing and are never
placed in receipts, audit metadata, URLs or route responses.

Provider payloads stored in the hash-chained receipt ledger are key-scanned for
secrets. Provider failures retain only bounded error codes and safe request IDs.
The private staging object is downloaded and SHA-256 verified before an HTTPS
signed URL is issued. The URL origin is pinned to `HOOMA_SOCIAL_MEDIA_BASE_URL`
and remains valid for one hour so Meta can fetch the exact immutable binary.

## Policy and identity gates

The worker requires the exact `@hooma.ge` professional account ID and exact
three granted scopes. Database RPCs re-check active product, live connection,
token expiry, schedule window, `APPROVED_EXACT`, matching fingerprint, cleared
rights/visual claims, music receipt, and provider-side duplicate evidence
immediately before either first dispatch.

Analytics is GET-only and separately gated. Snapshots are immutable at T+2h,
T+24h and T+72h, with missing values stored as `null`. No analytics result can
automatically delete, edit, promote or spend.

## Operational rollback

Set either `HOOMA_INSTAGRAM_PUBLISHING_ENABLED=0` or
`HOOMA_SOCIAL_PUBLISHING_ENABLED=0` to stop new POSTs. Set
`HOOMA_INSTAGRAM_API_NETWORK_ENABLED=0` to stop all Instagram API traffic while
leaving OAuth data encrypted and intact. OAuth/token maintenance has its own
gate and does not satisfy publishing gates.
