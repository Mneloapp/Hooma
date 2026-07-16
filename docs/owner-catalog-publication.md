# Owner-controlled catalog publication

Catalog ingestion always creates a Draft. No import, scraper, staff member, or automated job can publish a product.

The active Owner records three explicit decisions on the product page:

1. Source rights and media evidence.
2. Production readiness after technical data, pricing and test-print review.
3. Final publication or removal from the public catalog.

Each decision is re-authorized in a service-role-only database function and written to `audit_log`. The existing database publish trigger remains in place as a final consistency guard. Unpublishing sets the product to `archived`; it does not erase order or deal history.
