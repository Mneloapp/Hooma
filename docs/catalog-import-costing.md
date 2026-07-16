# Catalog import and costing

## Workflow

1. An admin pastes an HTTPS MakerWorld model URL in **Admin → New product** or **Import Inbox**.
2. Trusted server code validates the hostname, follows only allow-listed MakerWorld redirects, limits the response to 2 MB, and extracts public page metadata.
3. Hooma stores an admin-only import task with the source URL, model ID, title, description, and preview image URLs.
4. The admin reviews category, material, grams, print minutes, dimensions, plate count, margin, license, and media rights.
5. One database function atomically creates the product, variant, source record, cost snapshot, and audit event as a non-public Draft.
6. Publication remains blocked until commercial/media rights, production approval, a priced active variant, and test-print review are complete.

MakerWorld page extraction is best effort because no supported public API is assumed. Missing print time, weight, dimensions, plates, or material must be confirmed from a 3MF/Bambu Studio print profile. Source images remain remote preview links until media rights are verified.

## Pricing formula

The admin configures material cost per kilogram, material waste, machine cost per hour, labor, packaging, overhead, failure reserve, margin, VAT, and rounding.

`production cost = material + machine time + labor + packaging + overhead + failure reserve`

`price before VAT = production cost / (1 - margin)`

The final price adds configured VAT and rounds upward to the configured step. Every product stores a complete calculation snapshot. Cost and margin tables have admin-only RLS and are never read by public storefront code.

## Required setup

Apply `supabase/migrations/20260714000300_catalog_import_costing.sql`, configure `SUPABASE_SECRET_KEY`, and ensure the operator profile has the `admin` role.
