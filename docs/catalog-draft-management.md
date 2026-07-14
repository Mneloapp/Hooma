# Catalog Draft management

## Save behavior

- MakerWorld Import creation is idempotent: an Import already linked to a product returns that product instead of creating a duplicate.
- A source URL already owned by another product links the Import to the existing product.
- Duplicate slugs, invalid rights evidence, inactive categories/materials, and invalid technical values return operator-readable errors.
- The successful Review form exposes a direct link to the saved product.

## Delete behavior

- Only an active `owner` or `admin` may delete a catalog Draft.
- Only `products.status = 'draft'` is eligible.
- Products referenced by an order or daily-deal history cannot be deleted.
- Related variants, source rights, inventory, and cost estimates use existing database cascades.
- The source Import is retained and reset to `needs_review`, so an accidental product setup can be corrected without pasting the source URL again.
- Every successful deletion writes `catalog_draft_deleted` to `audit_log`.

## Threat review

The browser supplies only a product UUID and cannot authorize deletion. The server action re-reads the authenticated profile and restricts the operation to Owner/Admin. The database function repeats that authorization check, locks the product row, checks protected references, performs the mutation transactionally, and is executable only by `service_role`. No service key is exposed to the browser.
