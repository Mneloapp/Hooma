# Instagram Reels read provider — threat review

Reviewed: 2026-08-16

## Scope

This change adds an isolated server-only client for four read-only Instagram API with Instagram Login operations: content-publishing quota, owned-media duplicate lookup, media-container status, and owned-media insights. It does not create a media container, publish a container, register a route or cron, load a token from storage, or enable network access.

## Activation boundary

The client requires an exact v25.0 activation object with immutable SHA-256 references for the reviewed endpoint schema, OAuth connection, account identity, and granted scopes. It accepts only the owned `@hooma.ge` professional account and the exact three granted scopes already approved for Hooma. A caller must opt in in code and `HOOMA_INSTAGRAM_API_NETWORK_ENABLED=1` must also be set. Insights additionally require an explicit caller opt-in and `HOOMA_INSTAGRAM_INSIGHTS_ENABLED=1`. Both environment switches default to off.

## Read behavior

- Access tokens are runtime-only Bearer headers. They never enter URLs, return values, exceptions, or receipts.
- Response bodies are size-limited, parsed with lossless handling for numeric Meta IDs, and reduced to allowlisted fields.
- Provider error messages and raw bodies are discarded. Only bounded error codes, subcodes, and trace IDs survive.
- Duplicate lookup scans owned media only, matches an exact caption SHA-256 and Reel product type, and returns `INCONCLUSIVE_PAGE_LIMIT` rather than `CLEAR` if its bounded pagination limit is reached.
- Container status rejects unknown future status values and binds the response ID to the requested container.
- Insights preserve an unavailable metric as `null`; a real returned zero remains `0`.

## Deliberately absent

There are no POST requests or publishing methods, no provider adapter registration, no cron route, no media staging URL, no delete/comment/boost/promote/Facebook operation, and no production activation object. Publishing remains controlled by the independent `HOOMA_SOCIAL_PUBLISHING_ENABLED` kill switch and the still-missing mutating provider adapter.

## Documentation reviewed

- Meta's verified Instagram Postman workspace: `https://www.postman.com/meta/instagram/overview`
- Instagram media insights request: `https://www.postman.com/meta/instagram/request/23987686-0089d9e0-6141-4f69-a967-9d4c1c277ec9`
- Instagram Reels container publishing reference, used only to distinguish read status from future mutations: `https://www.postman.com/meta/instagram/request/23987686-f1c081c0-be35-4ffa-84bb-2c1726860c2b`

The live Meta App Dashboard and the pinned v25.0 contract remain authoritative. Any API-version or response-schema change requires a new schema ID, tests, receipt, and explicit activation; it is not accepted implicitly.
