# Hooma mobile store submission checklist

Do not submit or publish without explicit CEO approval.

## Permanent identity

- [ ] CEO confirms iOS bundle identifier `ge.hooma.app`.
- [ ] CEO confirms Android application ID `ge.hooma.app`.
- [ ] Apple Team ID and all signing-certificate SHA-256 fingerprints are deployed to `hooma.ge`.
- [ ] Universal links and Android App Links pass on physical devices.

## Product and legal

- [ ] Final app name, subtitle, description, keywords and category approved.
- [ ] Final icon, adaptive icon, splash and screenshots approved.
- [ ] Privacy Policy and Terms are final and available at stable HTTPS URLs.
- [ ] App Store privacy nutrition labels completed.
- [ ] Google Play Data safety form completed.
- [ ] In-app account-deletion request tested and operational runbook assigned.
- [ ] Support email and support URL are live.
- [ ] Demo/reviewer account prepared without exposing production customer data.

## Authentication

- [ ] Email signup/login/confirmation/reset tested.
- [ ] Google OAuth tested on production-signed iOS and Android builds.
- [ ] Sign in with Apple tested on device.
- [ ] Supabase redirect allow-list contains only required production and controlled development URLs.
- [ ] Sign out and expired-session recovery tested.

## Commerce and security

- [ ] CEO separately approves enabling `BOG_PAYMENTS_ENABLED`.
- [ ] CEO separately approves enabling `HOOMA_PLUS_PAYMENTS_ENABLED`.
- [ ] 99.99/100.00/above-100 delivery boundaries pass against the deployed database.
- [ ] Hooma+, first-10 units, reservation, failure release and idempotency tests pass.
- [ ] A success deep link without a signed callback remains pending.
- [ ] Double-tap, lost-response, stale-session and callback-retry scenarios pass.
- [ ] No service-role, BOG, OpenAI, APNs, FCM or Apple secret appears in JS bundles, source maps or logs.
- [ ] Custom upload type/size/ownership checks pass.
- [ ] RLS and API authorization tests pass in staging.

## Push and links

- [ ] APNs configured in EAS.
- [ ] FCM V1 configured in EAS.
- [ ] Five-minute production push scheduling enabled through Vercel or an approved external scheduler.
- [ ] Order-received, payment-confirmed, production, quality, ready, courier, delivered and Hooma+ expiry events tested.
- [ ] DeviceNotRegistered tokens are disabled.
- [ ] `apple-app-site-association` returns the production App ID.
- [ ] `assetlinks.json` returns Play App Signing and relevant test fingerprints.

## Quality

- [ ] TypeScript, lint, unit, payment, auth/deep-link and API authorization tests pass.
- [ ] `expo-doctor` passes.
- [ ] iOS development build passes on the minimum supported iOS version and current iOS.
- [ ] Android development/preview build passes on low-memory and current devices.
- [ ] VoiceOver/TalkBack, Dynamic Type/font scaling and 44pt touch targets checked.
- [ ] Georgian and English copy checked on small and large screens.
- [ ] Offline, timeout, empty, loading, error and retry states checked.
- [ ] Existing Hooma web production build/tests and Vercel preview pass.
- [ ] Crash reporting and production support ownership are agreed.

## Submission

- [ ] Version/build numbers are unique and correct.
- [ ] Production EAS environment values are reviewed.
- [ ] AAB uploaded to an internal Play track first.
- [ ] iOS build distributed through TestFlight first.
- [ ] Internal testers approve checkout, auth, push and tracking.
- [ ] Store review notes explain made-to-order products and BOG hosted checkout.
- [ ] Phased rollout and rollback/support plan approved.
