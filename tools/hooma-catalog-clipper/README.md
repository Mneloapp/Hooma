# Hooma Catalog Clipper

Chrome/Edge Manifest V3 extension that reads the public product information visible on the page currently open by the operator. It uses JSON-LD, Open Graph metadata and visible page content, then exports an allow-listed `hooma-catalog-clipper-v1` JSON draft.

The extension has no Supabase credentials, does not sign in to Hooma, does not read cookies/passwords, does not bypass website access controls, and cannot publish a product. An authenticated Hooma admin must review the imported fields, upload the downloaded media files and create the Draft.

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

Dimensions are deliberately omitted because Hooma pricing uses material weight and print time. The category path comes from the visible breadcrumb first, so a page translated by Chrome exports the category labels shown to the operator. Websites expose different data, so the clipper never invents missing technical values. Empty fields remain empty for operator review. Some sites may also prevent direct media downloads; in that case save the permitted media manually and upload it through the existing Hooma media selector.

If the clipper package still contains non-Georgian product copy, translation runs only after an authenticated Admin/Owner imports it into Hooma. The optional Google Cloud API key stays in Hooma's server environment and is never embedded in the browser extension or exported JSON. The operator must review all copy before publication.
