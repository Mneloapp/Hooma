# Custom quote workflow

## Customer flow

1. An authenticated customer opens `/account/custom-orders`.
2. The server validates file count, extension, and size, then issues one-time signed upload tokens.
3. Files upload directly to the private `custom-quote-files` Supabase bucket.
4. The request appears in the customer account with `submitted` status.
5. An operator reviews the files and publishes a unit price, lead time, and notes.
6. The customer accepts the quote; the request moves to `payment_pending`.
7. Live bank checkout will collect the delivery address and initiate TBC or Bank of Georgia payment.

## Payment and production boundary

Only a signature-verified, idempotent bank webhook may mark a quote `paid`. Trusted server code then calls `queue_paid_custom_quote(uuid)`. The database function:

- verifies paid status, price, delivery address, and operator file approval;
- creates the normal Hooma order and order item;
- creates a customer-visible order event;
- creates a print job with `awaiting_approval` status;
- links the custom request to the order.

The function never sends a printer command. The operator must still approve the print job before the future Bambu Lab adapter may start it.

## File security

- Maximum 5 files, 100 MB each, 250 MB total.
- Accepted extensions: 3MF, STL, STEP, STP, OBJ, ZIP, PDF, PNG, JPG, JPEG, WEBP.
- The storage bucket is private.
- General authenticated uploads are disabled; trusted server code issues one-time signed upload tokens.
- Customer and admin reads are protected by RLS.
- Uploaded geometry is never sliced or printed automatically.
