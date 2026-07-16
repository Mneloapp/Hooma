# Daily deals

`/deals` is a standalone page. At midnight in Tbilisi, a protected Vercel cron asks Supabase to select up to 100 distinct, active, production-approved products with real prices and applies an exact 50% discount for that date.

## Rotation

Selection uses the least recently featured products first. Products that have never appeared are prioritized, then the oldest appearances. This completes the broadest possible catalog rotation before reusing products. If fewer than 100 eligible products exist, the page displays the available count without creating fake products or prices.

## Required setup

1. Apply `supabase/migrations/20260714000200_daily_deals.sql`.
2. Set `SUPABASE_SECRET_KEY` and a strong `CRON_SECRET` in Vercel.
3. Keep the Vercel schedule at `0 20 * * *` (20:00 UTC is 00:00 in Tbilisi).
4. Only products with `status = active`, `production_status = approved`, an active variant, and a numeric price are eligible.

The database snapshots both the original and discounted price. Checkout code must resolve the price through the server-only `resolve_catalog_price` function; browser-submitted prices are never authoritative.
