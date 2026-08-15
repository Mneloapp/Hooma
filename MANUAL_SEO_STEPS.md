# Hooma — Manual SEO Steps

None of the actions in this document are performed by the integration branch. Production deployment, promotion, domains, DNS, and Search Console require explicit owner approval.

## 1. Vercel `www.hooma.ge` → `hooma.ge`

After the reviewed commit is approved for production:

1. Open Vercel Dashboard → team `mnelo` → project `hooma` → Settings → Domains.
2. Confirm both `hooma.ge` and `www.hooma.ge` show valid configuration.
3. Keep `hooma.ge` attached to production as the canonical apex domain.
4. Edit `www.hooma.ge`, choose redirect to another domain, and set the target to `hooma.ge` with a permanent redirect (308).
5. If Vercel requests a DNS change, use only the exact record it displays. Do not delete unrelated records.
6. Verify the root and a real nested path, including query preservation:

```sh
curl -I https://www.hooma.ge/
curl -I 'https://www.hooma.ge/product/REAL-SLUG?source=test'
curl -I https://hooma.ge/
```

Expected: one 308 hop to the identical apex path/query, followed by the apex response. Do not emulate this redirect in Next.js while Vercel owns the domain policy.

## 2. Post-production technical verification

Run the SEO regression against `https://hooma.ge`, then verify:

- `/robots.txt`, `/sitemap.xml`, `/opengraph-image`;
- homepage, shop, one category, and at least three real public products;
- Product/Offer/BreadcrumbList with Rich Results Test;
- filter/search noindex, private noindex, legacy 308, and unknown 404;
- canonical host and Google-selected canonical;
- console/runtime logs and zero 5xx.

Do not add `sameAs`, review/rating, inventory quantity, shipping, returns, or ProductGroup fields until their real public data is approved.

## 3. Google Search Console

1. Create or verify the Domain property `hooma.ge`.
2. Add the verification TXT record only with DNS-change approval.
3. Submit `https://hooma.ge/sitemap.xml` in Sitemaps.
4. Run URL Inspection for `/`, `/shop`, one category, three products, `/about`, and `/faq`.
5. Confirm the user-declared and Google-selected canonical is the apex URL.
6. Monitor Pages, Product snippets/Merchant listings, Core Web Vitals, soft 404, blocked URLs, and 5xx reports.

## 4. Remaining owner inputs

- verified official Hooma social profile URLs before `OnlineStore.sameAs`;
- approved shipping/return policy data before Offer policy schema;
- explicit production release approval;
- explicit DNS/Vercel domain and Search Console approval.
