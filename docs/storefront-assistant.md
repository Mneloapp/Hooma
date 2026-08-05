# Storefront assistant V1

Hooma's storefront assistant is a read-only, Georgian-first customer-support surface.

## Behavior

- Approved FAQ topics are answered deterministically without an OpenAI request.
- Other questions use the OpenAI Responses API with `store: false`, strict structured output, moderation, timeout, and no automatic paid retry.
- V1 is deliberately stateless on the server: only the current, validated user question is sent to the provider. Browser-supplied prior user or assistant messages are never trusted or forwarded.
- Product suggestions come only from Hooma's current public `storefront_product_cards` read model.
- Product names and descriptions are treated as untrusted evidence and can never override assistant instructions.
- The model may recommend only server-whitelisted internal actions and product slugs that were returned by the catalog lookup.
- The assistant never reads personal orders, payment details, addresses, uploaded files, or customer profiles. Order-status questions link to the authenticated Orders page.
- Chat text is not written to Hooma's database. The rate-limit audit entry stores only an HMAC of the request IP, request ID, character count, and timestamp; the raw IP and user agent are not stored by this feature.

## Environment

Set these server-side in the Vercel project:

```text
OPENAI_API_KEY=
HOOMA_ASSISTANT_MODEL=gpt-5-mini
HOOMA_ASSISTANT_RATE_LIMIT_SECRET=
```

Use a dedicated OpenAI project/key with a project spend limit. The rate-limit secret is optional; when absent, the API key is used only as the HMAC secret. Never expose either value through a `NEXT_PUBLIC_` variable.

## Database

Apply `20260729000100_storefront_assistant_rate_limit.sql` before enabling free-form AI answers. Its service-role-only RPC atomically enforces:

- 15 paid answers per client per 10 minutes
- 60 paid answers per client per 24 hours
- 300 paid answers globally per hour
- 2,000 paid answers globally per 24 hours

The limits do not apply to deterministic FAQ answers because they incur no provider cost.

## V1 safety boundary

- A listed item may be described as available to order or made to order, never as an inventory quantity.
- Catalog prices are starting prices; the product/checkout flow remains authoritative for the current configuration and final amount.
- Preparing or dispatching a standard catalog order within three business days is a target, not an unconditional arrival guarantee.
- Delivery fees, exact custom feasibility, refunds, return windows, payment results, and personal order status are never guessed.
- The general contact form is the approved human-support handoff. The assistant may link to it but never collects personal order details in chat or promises a response deadline.

## Threat review

- **Prompt injection:** catalog copy is labeled untrusted, structured output is required, and the server filters every action and product slug against its own allowlist.
- **Transcript poisoning and PII replay:** the API accepts exactly one current user message. It rejects browser-supplied history, checks common sensitive-data formats, and moderates the only user text sent to the provider.
- **Cross-site abuse:** the endpoint requires JSON and validates the request origin against the storefront host.
- **Spend abuse:** an atomic service-role-only database function applies IP-HMAC and global request limits before a paid model call. No automatic paid retry is performed.
- **Data exposure:** the assistant reads only public catalog projections and approved operational copy. It never queries customers, orders, payments, addresses, or uploaded files.
