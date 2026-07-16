# Admin direct catalog publication

Catalog publication is a one-click action available to active `admin` and `owner` profiles. The browser sends only the product identifier and desired publication state. The server re-reads the product, actor role, source record, active variant, price, and technical print values before changing status.

Publishing also sets `production_status` to `approved` after the technical checks pass. Every publish and unpublish action writes an audit event with the actor role, previous state, resulting state, and publication mode.

## Threat review

- The service-role client remains server-only.
- Client-submitted prices and production values are never trusted.
- Customers and ordinary authenticated users cannot execute the database function.
- Inactive staff profiles and roles other than `admin` or `owner` are rejected.
- Public source eligibility remains enforced in the database and is not exposed as a customer-facing workflow.

## Draft storefront preview

Catalog staff can open a Draft in the customer product-page layout without publishing it. The preview loader verifies `catalog.manage` before the service-role query, validates the product UUID, keeps `isOrderable` false, and never includes the Draft in the anonymous catalog query. An unauthenticated visitor receives a not-found response for the preview URL.
