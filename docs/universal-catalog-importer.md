# Universal catalog importer

The catalog importer reads public product-page metadata through a shared JSON-LD/Open Graph parser. Built-in source hosts are MakerWorld, Printables, Thingiverse, Thangs, MyMiniFactory, and Cults3D. Extra source hosts can be added with the comma-separated server variable `HOOMA_IMPORT_ALLOWED_HOSTS`.

The importer extracts title, description, canonical URL, model identifier, and up to 12 source image URLs. Platform-specific adapters can extend the same metadata shape with material, weight, print time, dimensions, and profile identifiers.

CC0 and Public Domain declarations are recognized from structured `license` fields, license meta tags, and `rel=license` links. When that status is explicit in the source metadata, the resulting Draft is internally eligible for Admin/Owner publication without a manual license page. Unknown reuse status remains available as a staff-only Draft preview.

## Security notes

- Only HTTPS pages on built-in or explicitly configured source hosts can be fetched.
- Redirects are revalidated against the same host policy.
- User credentials, nonstandard ports, non-HTML responses, excessive redirects, and responses over 2 MB are rejected.
- Image URLs submitted during review must match the URLs extracted from that import, with a legacy exception for MakerWorld's known image CDN.
- Browser-submitted prices are ignored; technical pricing remains server-calculated.
- Every extraction success/failure and product mutation is written to the audit log.
