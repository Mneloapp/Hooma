# Hooma Catalog Clipper

Chrome/Edge Manifest V3 extension that reads the public product information visible on the page currently open by the operator. It uses JSON-LD, Open Graph metadata and visible page content, then exports an allow-listed `hooma-catalog-clipper-v1` JSON draft. MakerWorld Assisted Mode can also send operator-reviewed results directly into an assigned Hooma Catalog Agent job.

The extension has no Supabase credentials, does not read page cookies/passwords, does not bypass website access controls, and cannot publish a product. Assisted Mode uses one narrowly scoped, revocable Catalog Agent token stored only in the current Chrome profile. An authenticated Hooma admin must still review every Draft and decide whether to publish it.

## Install

1. Pull the latest Hooma branch.
2. Chrome: open `chrome://extensions`. Edge: open `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `tools/hooma-catalog-clipper` directory.

## Product flow

1. Open a product page in Chrome/Edge and wait until its content is visible.
2. To avoid a cloud translation request, use Chrome's **Translate to Georgian** on the page and wait until the visible product copy changes.
3. Open **Hooma Catalog Clipper** and choose **გახსნილი გვერდის წაკითხვა**. The clipper prioritizes the visible translated title and description over untranslated JSON-LD/Open Graph metadata. For category detection it reads the breadcrumb first, then visible category links/chips and canonicalizes a recognized match to Hooma's Georgian category tree. On MakerWorld it also reads the selected print profile's same-origin metadata to fill the dominant material, total filament weight and print prediction; other sites use visible English/Georgian technical labels and profile blocks.
4. Review/correct the visible category path, material, weight, print hours and remaining minutes; choose the customer color choices or one fixed AMS color composition; then select up to 12 images.
5. Choose **სრული პაკეტის ჩამოტვირთვა**. JSON and media are saved together under `Downloads/hooma-import/<product-name>`.
6. In Hooma open **Admin → პროდუქტები → ახალი პროდუქტი**.
7. Choose the downloaded product package folder once. Hooma matches the extracted category/subcategory path against its active 11-category/58-subcategory tree, fills the technical and color fields and attaches its image/video files automatically. Copy already captured in Georgian skips the Google Cloud translation request; non-Georgian copy can still use the configured server translation fallback.
8. Review the Georgian copy, complete any missing category/material information and create the Draft.

## MakerWorld Assisted Mode

Use a separate Catalog Agent identity for this mode. Do not reuse the token already running in `tools/hooma-catalog-agent`, because both clients could otherwise claim the same assigned job.

1. In Hooma Admin → Catalog Agent register a new identity, for example `Hooma MakerWorld Assisted · Windows 01`, and copy its one-time token.
2. In Hooma Admin create a MakerWorld category job assigned to this new agent.
3. Open the Clipper and save the Assisted Agent token once. It remains only in this Chrome profile's extension storage; never paste a Supabase key here.
4. Choose **დავალების აღება**.
5. Open the assigned MakerWorld category in the ordinary Chrome window. If MakerWorld asks for human verification, complete it yourself and wait until the product cards are visible.
6. Choose **ხილული პროდუქტების რიგში დამატება**. The Clipper captures at most 100 product links currently present in the rendered page. It does not scroll or navigate automatically. If you want more, scroll manually and press the button again.
7. Choose **შემდეგი პროდუქტის გახსნა**. Wait for that product page to render and, if necessary, complete the site's verification yourself.
8. Choose **გახსნილი გვერდის წაკითხვა**, review/correct the extracted Georgian text, media, category, material, weight, print time and colors, then choose **Draft-ის გაგზავნა Hooma-ში**.
9. Repeat steps 7–8. When there are no pending products, choose **დავალების დასრულება**.
10. Review the resulting Drafts and Import Review records in Hooma Admin. Publication always remains an Admin/Owner decision.

Assisted Mode never performs automatic CAPTCHA solving, stealth/fingerprint changes, unattended browsing, automatic scrolling, or access-control bypass. If the site keeps showing verification, finish it in the normal browser session or pause the job. Revoke the Assisted Agent in Hooma Admin if the Windows machine or Chrome profile is no longer trusted.

Dimensions are deliberately omitted because Hooma pricing uses material weight and print time. The category path comes from the visible breadcrumb first, so a page translated by Chrome exports the category labels shown to the operator. Websites expose different data, so the clipper never invents missing technical values. Empty fields remain empty for operator review. Some sites may also prevent direct media downloads; in that case save the permitted media manually and upload it through the existing Hooma media selector.

If the clipper package still contains non-Georgian product copy, translation runs only after an authenticated Admin/Owner imports it into Hooma. The optional Google Cloud API key stays in Hooma's server environment and is never embedded in the browser extension or exported JSON. The operator must review all copy before publication.
