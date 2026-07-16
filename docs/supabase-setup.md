# Hooma Supabase setup

## Linked project

- Project name: `Hooma`
- Project ref: `qlagrwxuvfzbmxttdvtq`
- Remote schema changes are deployed only through timestamped files in `supabase/migrations`.

## Secrets

Never commit the database password, secret API key, access token, or `.env.local` files.

For database CLI commands, copy `supabase/.env.example` to `supabase/.env.local` and set `SUPABASE_DB_PASSWORD` locally. The destination file is ignored by Git.

For the Next.js application, copy `.env.example` to `.env.local` and set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://qlagrwxuvfzbmxttdvtq.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
SUPABASE_SECRET_KEY=sb_secret_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
CRON_SECRET=<a-long-random-value>
```

The publishable key may be used by browser code. `SUPABASE_SECRET_KEY` is server-only and must never use the `NEXT_PUBLIC_` prefix.

## Migration workflow

From the repository root:

```bash
npx supabase login
npx supabase link --project-ref qlagrwxuvfzbmxttdvtq
```

Load the local database password without printing it, then verify and deploy:

```bash
set -a
source supabase/.env.local
set +a
pnpm db:migrations
pnpm db:push:dry-run
pnpm db:push
pnpm db:migrations
```

Do not apply schema SQL manually in the remote SQL Editor. The CLI records each applied migration in Supabase migration history.

## Application configuration

In the Supabase Dashboard, copy the Project URL and publishable key from the Connect dialog or Settings > API Keys. Create a separate secret key for the Hooma server. Put them only in local/Vercel environment variables.

For local authentication, configure the hosted Supabase project with:

- Site URL: `http://localhost:3000`
- Allowed redirect URL: `http://localhost:3000/auth/callback`

Add exact Vercel Preview and production callback URLs after those deployments exist.
