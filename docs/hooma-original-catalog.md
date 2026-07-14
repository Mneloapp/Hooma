# Hooma original catalog path

The manual product form creates products owned and supplied by Hooma without an external-source review screen. It stores a `hooma` source record internally, calculates price from authoritative material and pricing profiles, creates one technical variant, and leaves the product in Draft until an Admin or Owner publishes it.

## Security notes

- Only active `admin` and `owner` profiles can execute the server-side creation function.
- Category, material, pricing, weight, time, dimensions, and margin are validated again in Postgres.
- Browser-submitted prices are ignored; the final price is calculated in the database.
- Every creation and publication action is written to the audit log.
- The form does not copy external descriptions, images, or source files.
