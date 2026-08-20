# Instagram nine-day campaign · 2026-08-22

This is an owner-authorized, exact-binary launch for nine Instagram Reels on
`@hooma.ge`. It does not grant a general-purpose uploader and it does not
change Facebook state.

## Fixed safety contract

- Owner-only launch UI: `/admin/automations/instagram-launch`.
- Exact canonical origin: `https://hooma.ge`.
- Exactly nine post IDs, captions, product URLs, schedules, covers and final
  video SHA-256 values are frozen in source.
- Each browser file is hashed before upload; the server downloads it from the
  private `social-publishing-staging` bucket and hashes it again.
- The server verifies the active product, active `@hooma.ge` connection,
  licensed pre-mixed music receipt, staging origin and future publish window.
- The job is inserted fail-closed (`publishing_allowed=false`,
  `WAITING_FOR_GIORGI`) before the authenticated owner RPC binds the current
  database-computed content fingerprint as `APPROVED_EXACT`.
- Owner attestation received 2026-08-21 covers the use and upload rights for
  all nine exact masters. This attestation is persisted in immutable job
  settings; it does not apply to changed media.
- Instagram Share to Facebook is `false`; Facebook remains disabled.
- Publishing is handled only by the crash-safe Instagram worker at each
  frozen Asia/Tbilisi schedule. T+2h, T+24h and T+72h insights are immutable;
  unavailable metrics are stored as `null`.

The upload/finalize routes are idempotent. A retry can only reuse the exact
same object hashes and exact existing database job. Any mismatch fails closed.
