# 2026-08-21 tissue-box cross-platform test

The owner approved moving the exact Mario-themed tissue-box master from the
last day of the campaign to 2026-08-21 at 20:00 Asia/Tbilisi on Instagram and
TikTok. The remaining eight campaign masters keep their 2026-08-22 through
2026-08-29 schedule.

## Safety model

- Both replacement rows receive new platform-specific post and idempotency
  identities. The previously approved August 30 rows are retained as immutable
  history but become `cancelled`, `REVOKED`, and publishing-disabled before a
  replacement can be inserted.
- Cancellation is an authenticated owner-only RPC. It locks the source row,
  rejects attempted or remotely-dispatched jobs, and atomically appends the
  cancellation receipt, job audit event, and global admin audit record.
- The exact staged video and cover hashes are re-read and re-hashed. Product
  availability, account identity, music provenance, rights, caption, settings,
  schedule, and approval fingerprint are revalidated before approval.
- The binary is the existing licensed voice/music master. Silent publishing is
  prohibited. Instagram Facebook sharing stays off; TikTok drafts, ads-only
  upload, duet, and stitch stay off.
- The regular workers retain duplicate checks before the first remote dispatch,
  crash-safe intent receipts, remote status polling, and immutable analytics at
  T+2h, T+24h, and T+72h. Unavailable metrics remain `null`.
