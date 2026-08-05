# General contact and support form

`/contact` is Hooma's public human-support channel for order, payment, refund,
delivery, product-quality, account/privacy, Hooma+, partnership, and general
questions. Custom manufacturing remains a separate authenticated workflow at
`/account/custom-orders`.

## Production environment

Set these as **server-only Production** variables in Vercel:

```text
HOOMA_CONTACT_ENABLED=false
RESEND_API_KEY=
HOOMA_CONTACT_FROM_EMAIL=Hooma Website <support@hooma.ge>
HOOMA_CONTACT_RATE_LIMIT_SECRET=
```

- Create a dedicated Resend sending-only API key. Supabase Auth's Resend SMTP
  password is a separate integration and is not automatically available to the
  Next.js application.
- `HOOMA_CONTACT_FROM_EMAIL` must use a sender/domain already verified in
  Resend. The recipient is fixed in server code to `support@hooma.ge`; the
  browser cannot choose it.
- Generate `HOOMA_CONTACT_RATE_LIMIT_SECRET` as a random value of at least 32
  bytes. It HMACs the request IP and normalized email before rate limiting, so
  neither raw value is stored as a limiter key.
- Never prefix these values with `NEXT_PUBLIC_`.
- Do not change Google Workspace MX records or the existing root SPF record for
  this form. If the Hooma domain is not already verified in Resend, add only the
  exact DKIM/SPF/return-path records Resend provides for the chosen sending
  domain or subdomain.

## Database and rollout

Apply `20260805000300_contact_support_requests.sql` before enabling the form.
It creates a protected `contact_requests` table and service-role-only RPCs for
atomic idempotency, rate limiting, and delivery-result recording.

Safe rollout order:

1. Deploy the application with `HOOMA_CONTACT_ENABLED=false`.
2. Apply the migration to the linked production Supabase project.
3. Add the Resend key, verified From address, and dedicated rate-limit secret
   to Vercel Production.
4. Set `HOOMA_CONTACT_ENABLED=true` and redeploy.
5. Submit one low-risk message from `https://www.hooma.ge/contact`; confirm one
   email reaches `support@hooma.ge`, the visible reference matches the email,
   and Reply answers the visitor's address.

To pause new web submissions, set `HOOMA_CONTACT_ENABLED=false` and redeploy.
The page continues to show the direct support email; existing stored requests
remain available to authorized Owner/Admin/Support staff.

## Security and privacy boundary

- Requests are validated again on the server; browser validation is advisory.
- The route accepts only same-origin JSON with a 16 KiB maximum request size.
- Per-client, per-email, and global limits are reserved atomically before an
  email call. A honeypot blocks simple automated spam.
- Resend receives a stable `Idempotency-Key` derived from the request UUID, so
  an uncertain retry cannot create a second logical email.
- `From` and `To` are controlled by Hooma. The validated visitor address appears
  only in `Reply-To`.
- Contact text is HTML-escaped and also sent as plain text. Provider responses
  are bounded and never copied into logs.
- Logs contain only a request UUID, safe status/error code, HTTP status, topic,
  character count, and HMAC fingerprint—never the raw IP, user agent, email,
  phone, or message.
- The form does not accept attachments, alter orders/payments/refunds, or send
  automatic replies to arbitrary addresses. Photos/files go through direct
  support email; custom production files use the private custom-order flow.
