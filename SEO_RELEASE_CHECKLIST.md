# Hooma SEO Release Checklist

## Local integration gate

- [ ] branch is `codex/seo-integration-main` and base SHA is recorded;
- [ ] `pnpm run typecheck` passes;
- [ ] `pnpm run lint` exits 0 and warnings are recorded;
- [ ] production build passes on Node 24.x;
- [ ] all existing tests pass;
- [ ] SEO regression passes at least 10/10;
- [ ] dependency audit is recorded;
- [ ] `git diff --check` passes;
- [ ] migration diff against the recorded main base is empty;
- [ ] secrets scan finds no `.env`, `.vercel`, OIDC/bypass credential, token, or private key;
- [ ] full `origin/main...HEAD` diff has been reviewed;
- [ ] final fetch shows no unsafe divergence from `origin/main`.

## Draft PR and Preview gate

- [ ] push only `codex/seo-integration-main`, without force;
- [ ] open a Draft PR to `main`; do not merge;
- [ ] Git-connected Preview belongs to `mnelo/hooma` and exact HEAD SHA;
- [ ] Preview emits `X-Robots-Tag: noindex, nofollow, noarchive`;
- [ ] SEO regression, routes, three products, cart/login gate, carousel, assistant, Hooma+, auth pages, catalog reads, console, runtime logs, and 5xx checks pass;
- [ ] no production database mutation/order/payment/refund/cancellation occurs;
- [ ] three mobile Lighthouse runs meet: Performance ≥90, LCP ≤3.17 s, CLS ≤0.1, TBT ≤200 ms;
- [ ] Preview raw homepage HTML stays below 300 KB;
- [ ] Supabase Edge Runtime warning is recorded and produces no runtime failure.

## Production — blocked pending explicit owner approval

- [ ] approve and merge the Draft PR;
- [ ] deploy/promote only the reviewed commit;
- [ ] rerun smoke, SEO regression, logs, and Lighthouse on production;
- [ ] configure `www.hooma.ge` → `hooma.ge` at the Vercel domain level;
- [ ] verify path/query preservation and absence of redirect chains;
- [ ] complete Search Console steps in `MANUAL_SEO_STEPS.md`.

## Rollback plan

If the production gate fails, use Vercel’s project deployment history to restore the immediately previous healthy production deployment. Do not change DNS, aliases, payments, Supabase schema, or catalog data as a rollback substitute. After rollback, verify homepage, login, cart, checkout login gate, robots, sitemap, and 5xx logs before investigating in a new branch.
