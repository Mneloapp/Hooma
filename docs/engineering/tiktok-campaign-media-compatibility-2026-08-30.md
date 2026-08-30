# TikTok campaign-media compatibility — threat review

Reviewed: 2026-08-30

## Scope

The nine-day campaign stages immutable TikTok masters as
`video-<sha256>.mp4`, while the delivery proxy originally accepted only
`<sha256>.mp4`. The campaign also produces a truthful music-only provenance
receipt for a silent visual master mixed with Hooma-owned, commercially
licensed music. The legacy provider contract required a voice receipt even
when no voice existed.

This change accepts those two canonical campaign formats. It does not loosen
the account, approval, publish-window, availability, duplicate, rights,
provider, or global kill-switch gates.

## Media-source boundary

- Only `<exact-video-sha256>.mp4` and `video-<exact-video-sha256>.mp4` are
  accepted as the final staging-path component. Arbitrary prefixes, suffixes,
  extensions, hosts, buckets, unsigned URLs, and mismatched hashes still fail
  closed.
- The source must remain an HTTPS signed object in the configured private
  Supabase staging bucket.
- The publish worker downloads the object and verifies its bytes against the
  approved SHA-256 before producing the delivery URL. TikTok's public proxy is
  therefore bound to both the approved digest and the verified staged bytes.

## Music-receipt boundary

- The new receipt path accepts only the exact
  `HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE` schema used by the campaign.
- It requires a verified license permitting commercial and organic TikTok
  use, immutable SHA-256 evidence, the selected track binding, a preserved
  silent master, an unchanged video-stream digest, matching durations, and an
  H.264/yuv420p master with AAC audio.
- The receipt may remain `WAITING_FOR_GIORGI` because mixing music creates the
  binary that is subsequently approved. The queue's separate
  `APPROVED_EXACT` gate must still match the final content fingerprint before
  any network call.
- No synthetic voice provenance is accepted or fabricated for a music-only
  asset, and TikTok receives the pre-mixed master without a replacement sound
  identifier.

## Regression coverage

Tests cover the canonical prefixed staging name, rejection of another prefix,
the unchanged legacy owned-master path, and a music-only master publish that
does not emit `music_sound_info`.
