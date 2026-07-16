# Hooma Auth and staff access

## V1 design

- Supabase Auth is the single identity system. Customers can use Google OAuth or email and password.
- Public signup always creates a `customer`. Role values submitted in signup metadata are ignored by the database trigger.
- Staff roles are `owner`, `admin`, `catalog_manager`, `production_operator`, and `support`.
- Only `owner` can open `/admin/team`, assign a staff role, change it, or disable a staff account.
- The Owner role cannot be assigned, demoted, or disabled from the UI. Bootstrap it once in Supabase SQL Editor after the CEO account exists.
- Sensitive mutations use the server-only service-role client, verify permission again in the Server Action, and write an audit event.
- Specialized staff RLS policies are read-only. Mutations must go through audited Server Actions.

## Role scope

| Role | Access |
| --- | --- |
| Owner | Everything, including team and role management |
| Admin | All catalog, pricing, order and production operations; no team-role management |
| Catalog manager | Products, categories and source imports; no cost settings or team access |
| Production operator | Inventory, orders, printer and production queue; no pricing or team access |
| Support | Customers, orders, tracking and custom quotes; no production, costing or team access |
| Customer | Own profile, orders, addresses and custom requests |

## Deployment checklist

1. Apply all Supabase migrations, including `20260714000400_auth_rbac.sql`.
2. Create the CEO account using the final Google/email address.
3. In Supabase SQL Editor run: `update public.profiles set role = 'owner' where email = 'CEO_EMAIL';`
4. In Google Cloud create a Web OAuth client and add the Supabase callback URL shown in Authentication > Providers > Google.
5. In Supabase enable Google, add the Client ID and Client Secret, set the production Site URL, and allow `/auth/callback` URLs for local, preview, and production environments.
6. Set `NEXT_PUBLIC_SITE_URL` in Vercel to the canonical production domain. Keep `SUPABASE_SECRET_KEY` server-only.
7. Before live payments, add and enforce TOTP MFA (`aal2`) for Owner and Admin accounts.

## Threat review

- **Self-promotion:** blocked because signup always writes `customer`; a database trigger rejects browser changes to `role`, `is_active`, and `invited_by`.
- **Stolen customer session:** customer routes cannot reach staff routes; middleware, server permission checks and RLS form independent layers.
- **Stolen staff session:** least-privilege roles limit exposed areas. Account disablement takes effect on the next protected request. Mandatory MFA is required before payment launch.
- **Open redirect:** login and OAuth callback accept only relative paths that begin with one `/`.
- **Service-key disclosure:** the admin client is server-only and no service key is referenced from client components.
- **Untracked privileged change:** team and operational Server Actions create `audit_log` rows. Direct specialized-role writes are not allowed by RLS.
- **Owner lockout:** the UI cannot modify or disable an Owner. Emergency Owner changes remain an explicit SQL-console operation.
