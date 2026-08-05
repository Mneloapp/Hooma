# Customer location map

The account address picker loads the Google Maps JavaScript API in the browser
and stores only the latitude and longitude selected by the customer. The API key
is intentionally public, so it must be restricted in Google Cloud rather than
treated as a server secret.

## Google Cloud setup

Use an API key, not a Google OAuth client ID or client secret.

1. Attach an active billing account to the Google Cloud project.
2. Enable **Maps JavaScript API** for that project.
3. Create or select a browser API key.
4. Set **Application restrictions** to **Websites** and allow:
   - `https://hooma.ge/*`
   - `https://www.hooma.ge/*`
   - the exact Vercel preview hostname only when preview testing is needed
5. Set **API restrictions** to **Maps JavaScript API**.
6. Add the key in Vercel as `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for Production
   (and Preview when required), then redeploy. A changed environment value does
   not affect an already-built deployment.

The loader deliberately does not send `auth_referrer_policy=origin`. Google only
supports that option when every matching website restriction omits a path. The
recommended Hooma restrictions use `/*`, so forcing an origin-only referrer can
produce `RefererNotAllowedMapError` even with an otherwise valid key.

## Failure behavior

Google reports key, billing, API activation, quota, and referrer failures through
the global `gm_authFailure` hook. Hooma listens for that hook and replaces the
broken Google error canvas with a customer-friendly fallback. Script/network
loads also time out instead of leaving an infinite spinner.

The customer can still use browser geolocation, save the coordinates, and open
the selected location in Google Maps when the visual map is temporarily
unavailable. Existing saved coordinates are never cleared by a map-load error.

For the exact provider error, open the browser console and look for
`Google Maps JavaScript API error:`. Common codes are:

- `RefererNotAllowedMapError`: correct the Website restrictions above.
- `ApiNotActivatedMapError`: enable Maps JavaScript API.
- `BillingNotEnabledMapError`: attach or restore project billing.
- `InvalidKeyMapError`: replace the environment value with a valid API key.
