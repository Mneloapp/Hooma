# BOG full-payment checkout

Hooma V1 uses Bank of Georgia hosted checkout for normal catalog orders and
prepaid Hooma+ membership purchases.

## Commercial scope

- Full payment only (`capture: automatic`)
- GEL only
- Card by default
- Apple Pay and Google Pay only after BOG activates each method for the merchant
- No installment (`bog_loan`)
- No BNPL
- No split payment
- No saved cards or recurring/automatic subscription charges
- Hooma+ is a one-time prepaid purchase for one month or one year and renews
  only when the customer explicitly pays again
- No preauthorization
- No custom-quote payment flow in this version

Customers enter payment details on BOG's hosted page. Hooma never receives or
stores a full PAN, CVV, or card token.

## Required environment

Set these server-side variables in Vercel for the intended environment:

```text
NEXT_PUBLIC_SITE_URL=https://hooma.ge
BOG_PAYMENTS_ENABLED=false
HOOMA_PLUS_PAYMENTS_ENABLED=false
BOG_CLIENT_ID=<bank-issued client id>
BOG_CLIENT_SECRET=<bank-issued secret>
BOG_PAYMENT_METHODS=card
```

`BOG_CLIENT_SECRET` must never use a `NEXT_PUBLIC_` prefix. The optional
`BOG_CALLBACK_PUBLIC_KEY` variable can override BOG's documented public key
after an announced rotation; it is not a secret. Multiline values may use
literal newlines or `\n`.

Keep `BOG_PAYMENTS_ENABLED=false` until the database migration, Vercel secrets,
merchant methods, callback, and bank-provided test transaction have all been
verified. Disabling the flag stops new payment sessions but deliberately does
not disable callbacks for payments that are already in progress.

Callback URL registered/sent to BOG:

```text
https://hooma.ge/api/payments/bog/callback
https://hooma.ge/api/payments/bog/hooma-plus/callback
```

The implementation uses BOG's published production API origins. The public
documentation does not describe a separate sandbox URL; obtain test
credentials and the approved test procedure directly from BOG.

## State and trust flow

1. The signed-in customer submits delivery data and a stable checkout UUID.
2. `begin_bog_checkout_v2` locks that UUID, rechecks catalog visibility,
   server pricing, Hooma+ status, welcome-unit balance and delivery pricing,
   then atomically creates the real order, item snapshots, benefit reservation,
   and BOG payment attempt.
3. The payment-attempt UUID becomes BOG's `external_order_id`; the checkout UUID
   becomes BOG's `Idempotency-Key`.
4. Hooma requests an automatic full-charge order and redirects only to the
   validated `https://payment.bog.ge` URL.
5. Returning to `/checkout/result` never marks an order paid.
6. The callback route reads the untouched request bytes, requires and verifies
   `Callback-Signature` with SHA256withRSA, and only then parses JSON.
7. Hooma fetches a fresh receipt from BOG and sends sanitized reconciliation
   fields to `apply_bog_payment_result_v1`.
8. The database locks the order and payment attempt. `completed` becomes `paid` only
   when provider ID, external ID, automatic capture, GEL, request amount,
   transfer amount, direct-debit option, non-split state, and allowed payment
   method all match.
9. Payment does not create print jobs. The existing human production approval
   remains mandatory.

Hooma+ uses separate purchase, payment-attempt, period, and event tables so a
membership payment can never enter physical production, catalog order
notifications, or product-sales accounting. Its callback performs the same raw
signature and fresh-receipt checks. A successful one-time payment activates a
calendar-month or calendar-year period; an active renewal extends from the
current expiry.

## Delivery policy

The database snapshots the rule and fee before BOG payment creation:

1. Active Hooma+ member: free standard catalog delivery.
2. Product subtotal strictly above GEL 100: free delivery.
3. If the complete cart's unit count fits inside the customer's remaining first
   10 welcome units: free delivery and those units are reserved.
4. Otherwise: GEL 5 per catalog order.

Welcome units are consumed only by the signed paid callback. A failed payment
releases them. Hooma+ and the subtotal threshold do not consume welcome units.
The BOG payload uses `purchase_units.delivery.amount` for a paid delivery fee,
so the basket plus delivery exactly equals the authoritative order total.

Callback events are deduplicated by both the signed raw-body SHA-256 and a
normalized fresh-receipt state SHA-256. This allows an unchanged callback retry
to apply a receipt that advanced from `processing` to `completed`, while exact
replays remain harmless. The ledger stores no buyer name/email, masked PAN, or
card expiry.

## Status mapping

| BOG status | Hooma result |
| --- | --- |
| `created`, `processing` | Payment remains pending |
| `completed` | Exact full payment becomes paid |
| `rejected` | Payment fails unless it was already paid/refunded |
| `refunded` | Only an exact full refund becomes refunded |
| `refund_requested` | Order is held in `review_required` |
| `refunded_partially` | Order is held in `review_required` |
| `auth_requested`, `blocked`, `partial_completed` | Order is held in `review_required`; these preauthorization states are not accepted |

Older pending/rejected callbacks cannot downgrade a paid or refunded attempt.

## Deployment

After the code is on `main`, update the Mac checkout and apply the migration:

```bash
cd /path/to/Hooma
git fetch origin
git pull --ff-only origin main

npx --yes supabase@2.110.0 db push --linked --dry-run
npx --yes supabase@2.110.0 db push --linked
```

Then add the BOG variables to Vercel Production and redeploy. Start with
`BOG_PAYMENT_METHODS=card`. Add `google_pay` and/or `apple_pay` only after BOG
confirms activation:

```text
BOG_PAYMENT_METHODS=card,google_pay,apple_pay
```

Finally set `BOG_PAYMENTS_ENABLED=true` and redeploy.
Set `HOOMA_PLUS_PAYMENTS_ENABLED=true` only after the separate Hooma+ callback
has also passed BOG acceptance testing.

## Pre-live checks

- BOG confirms merchant agreement, GEL terminal, callback URL, and enabled methods.
- A bank-issued test transaction reaches the hosted payment page.
- `Callback-Signature` arrives as the Base64 RSA signature expected by the
  verifier; confirm this during BOG acceptance testing because the public page
  names the algorithm but does not state the header's transport encoding.
- A success redirect shown without a callback remains pending.
- A valid callback plus receipt marks exactly one attempt and order paid.
- Replaying the same callback and same receipt is harmless; the same callback
  with a newer receipt state is applied once.
- Wrong amount, currency, method, external ID, split, recurring, installment,
  and manual-capture fixtures go to manual review and never mark paid.
- `/admin/orders` receives the paid-order notification.
- Production still requires operator confirmation.
- ERP legal name and tax ID are configured; otherwise the payment commits but
  the existing ERP sync issue ledger records an accounting follow-up.

## Incident controls

- To stop new payments immediately, set `BOG_PAYMENTS_ENABLED=false` and
  redeploy. Do not remove callback credentials while payments may still be in
  flight.
- Do not ask a customer to pay again after an ambiguous timeout. Retry only with
  the same checkout UUID/idempotency key or reconcile the BOG order first.
- Inspect `payment_provider_events` for `manual_review` rows without copying
  private order data into chat or logs.
- If a customer was charged but the signed callback did not arrive, use
  **Admin → Orders → BOG receipt-ის შემოწმება**. The action fetches BOG's fresh
  receipt, creates an operator audit event, and puts completed/refunded or
  anomalous states on `review_required`. It cannot mark an order paid; request
  signed callback redelivery from BOG before releasing production.
- Rotate `BOG_CLIENT_SECRET` in BOG and Vercel if exposure is suspected.
