# Hooma authentication branding

The application supports Google's browser-native Identity Services flow when
`NEXT_PUBLIC_GOOGLE_CLIENT_ID` is configured. This keeps the primary Google
sign-in experience attached to Hooma's web origin instead of sending the user
through the visible Supabase project hostname. If the variable is absent, the
existing Supabase OAuth redirect remains available as a safe fallback.

## Google Auth Platform

1. Open the Google Cloud project whose client ID and secret are configured in
   Supabase, then open **Google Auth Platform > Branding**.
2. Set the app name to `Hooma`, choose the support email, and upload a square
   Hooma symbol. Google recommends a 120 x 120 PNG/JPG/BMP under 1 MB.
3. Once the canonical domain is live, use:
   - Homepage: `https://hooma.ge`
   - Privacy policy: `https://hooma.ge/privacy`
   - Terms of service: `https://hooma.ge/terms`
   - Authorized domain: `hooma.ge`
4. In **Data Access**, keep only `openid`, `userinfo.email`, and
   `userinfo.profile` for sign-in.
5. In **Audience**, use External for the customer-facing app. Submit Branding
   verification when the production domain and public pages are ready.
6. In the Web OAuth client, add these JavaScript origins:
   - the canonical Hooma production origin;
   - the active Vercel preview origin while testing;
   - `http://localhost:3000` and `http://localhost:3001` for local testing.
7. Copy that Web OAuth Client ID into Vercel as
   `NEXT_PUBLIC_GOOGLE_CLIENT_ID` for Production, Preview, and Development, then
   redeploy. This ID is public by design; never expose the client secret.

Keep the existing Supabase callback URI registered in the Google Web client so
the fallback flow continues to work. If a Supabase custom domain is purchased
later, add its `/auth/v1/callback` URI before activating the domain.

## Hooma verification email

This Supabase project was created after the June 2026 free-tier template
change, so branded hosted templates require a custom SMTP provider even while
the project stays on Supabase Free.

Recommended first-stage setup:

1. Create a Resend account and verify a Hooma-owned sending domain.
2. Create an API key. In **Supabase > Authentication > Email > SMTP Settings**
   use:
   - Sender name: `Hooma`
   - Sender email: an address on the verified Hooma domain
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: the Resend API key
3. In **Authentication > Email Templates > Confirm signup** set the subject to
   `დაადასტურე Hooma-ს ანგარიში` and paste the contents of
   `supabase/templates/confirmation.html`.
4. In **Authentication > Sign In / Providers > Email**, enable email
   confirmation.
5. In **Authentication > URL Configuration**, set Site URL to the canonical
   Hooma domain and keep the production, preview, and localhost auth callback
   URLs in the redirect allow list.
6. Disable link/open tracking for authentication messages so the provider does
   not rewrite Supabase's one-time verification link.
7. Send a new test registration to a non-team email and verify sender name,
   logo, button, confirmation, and final redirect.

The hosted template is configured in the Dashboard, not through a database
migration. The `config.toml` entry only mirrors it for local Supabase.

## Optional fully branded Supabase hostname

Supabase custom domains are a paid-plan add-on. If this is enabled later, use a
subdomain such as `auth.hooma.ge`. Add the new Google callback URI before
activation and then update `NEXT_PUBLIC_SUPABASE_URL`. The default Supabase
project URL remains available during the transition.
