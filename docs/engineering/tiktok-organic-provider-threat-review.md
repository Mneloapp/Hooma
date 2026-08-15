# TikTok Organic Accounts provider — threat review

Reviewed: 2026-08-15

## Scope

This change adds an isolated server-only adapter for TikTok API for Business Organic Accounts operations. OAuth connection handling is a separate change. This adapter does not register itself with a cron route, deploy provider credentials, alter database schemas, or enable an external request path.

The implemented Organic Accounts operations are:

- publish a video by verified HTTPS URL;
- poll `/business/publish/status/` until a single public post ID is available;
- read owned-post metrics from `/business/video/list/`;
- validate a Commercial Music Library selection receipt bound to the exact approved account, post, media, caption, and content fingerprint.

## Activation boundary

Network access requires all of the following:

1. An activation object whose app status is `APPROVED`.
2. Immutable SHA-256 references for app review, endpoint-schema review, OAuth identity, the exact machine scopes returned by TikTok OAuth, URL-property verification, and CML-schema review.
3. The exact expected account ID and username.
4. The three approved portal permission labels: `Account User`, `Get Account Media`, and `Account Post Content`.
5. An allowlist of TikTok-verified media hosts.
6. An explicit constructor opt-in and `HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED=1`.

Publishing has a second independent kill switch. It additionally requires an explicit constructor opt-in and `HOOMA_TIKTOK_ORGANIC_PUBLISHING_ENABLED=1`. Both switches default to off. No production route constructs or registers this client in this change.

Portal permission labels are not OAuth scopes. Before constructing the activation object, the worker must inspect the access token and validate the exact machine scope identifiers returned by TikTok against the reviewed configuration, then store that result as the immutable OAuth-scope receipt. This adapter deliberately does not infer machine scopes from the three human-readable labels.

## Publish gates

The provider rejects the request before network I/O unless all policy inputs are exact:

- `APPROVED_EXACT` and matching approval/content fingerprints;
- rights and visual claims cleared;
- product currently available;
- due and inside the publish window;
- remote duplicate check recorded as clear with an immutable receipt hash;
- verified media host, exact video SHA-256, URL-property receipt, and at least 30 minutes of remaining URL lifetime;
- comments enabled, AI-generated label enabled, Hooma's own-brand disclosure enabled, paid-partnership disclosure disabled, draft mode disabled, ads-only mode disabled, and Facebook sharing disabled;
- an unexpired CML receipt with audible music volume and a fingerprint that changes when any track, mix, policy, media, caption, account, or approval field changes.

The v1 CML payload intentionally omits `music_sound_start` and `music_sound_end`. Their live schema and units must be frozen in an approved endpoint-schema receipt before a later schema version can support timing controls.

The returned publish receipt contains no access token, signed media URL, caption, or raw provider body. It stores allowlisted identifiers and hashes only.

## Status and metrics behavior

- `PUBLISH_COMPLETE` is not treated as published until exactly one valid TikTok post ID is returned. TikTok may populate the ID after the processing status first changes.
- Unknown statuses, multiple post IDs, malformed provider errors, and account/post mismatches fail closed.
- `SEND_TO_USER_INBOX` is a review-required failure for this direct-publish workflow.
- Provider failure reasons are reduced to bounded diagnostic codes. Raw messages and bodies are not persisted by this module.
- Missing metrics are `null`, not zero. A real returned zero remains zero.
- Metrics are read-only. This client has no delete, boost, promote, advertising, comment-mutation, or Facebook operation.

## Secret handling

Access tokens are accepted only as runtime arguments. They are sent in the documented `Access-Token` header and are never returned, hashed into receipts, written to logs, or included in exception messages. OAuth exchange and refresh-token lifecycle remain outside this adapter. Default network parsing limits responses to 1 MB and uses a 10-second timeout.

## Remaining production blockers

Publishing must remain disabled until all of these are completed:

1. TikTok approves `Hooma Organic Publisher` and its Accounts API access application.
2. Giorgi authorizes the owned `@hooma.ge` account and the OAuth identity and granted token scopes are recorded without secrets.
3. The current approved-app portal schema is frozen into an immutable review receipt, including `music_sound_info`, `is_ai_generated`, `is_brand_organic`, status values, and metrics fields.
4. The Hooma staging hostname is verified as a TikTok URL property and signed objects remain reachable for at least 30 minutes. The separate five-minute staging scaffold is insufficient for this adapter and must not be wired in unchanged.
5. A CML catalog/eligibility selection flow produces the exact receipt contract used here. The app's current requested permissions must be checked for any additional CML discovery permission before attempting automatic track selection.
6. A non-publishing validation/status canary passes against the approved app.
7. The owner gives fresh action-time approval for the first exact canary post before any cron registration is added.

## Documentation reviewed

- TikTok API for Business v1.3 endpoint inventory: `https://business-api.tiktok.com/gateway/docs/index?doc_id=1735713875563521`
- TikTok short-term token renewal: `https://business-api.tiktok.com/gateway/docs/index?doc_id=1833997679342594`
- TikTok official Postman collection: `https://www.postman.com/tiktok/tiktok-api-for-business/documentation/efqhadc/tiktok-business-api-v1-3`
- TikTok Commercial Music Library guidance: `https://ads.tiktok.com/help/article/how-to-use-the-commercial-music-library`

The approved application's live portal schema remains authoritative. A future schema change requires a new schema identifier, receipt, tests, and renewed exact approval; it must not be accepted implicitly.
