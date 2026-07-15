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
2. Open **Hooma Catalog Clipper** and choose **გახსნილი გვერდის წაკითხვა**.
3. Review/correct the extracted material, weight and print time; choose the customer color choices or one fixed AMS color composition; then select up to 12 images.
4. Choose **სრული პაკეტის ჩამოტვირთვა**. JSON and media are saved together under `Downloads/hooma-import/<product-name>`.
5. In Hooma open **Admin → პროდუქტები → ახალი პროდუქტი**.
6. Choose the downloaded product package folder once. Hooma securely translates the source name/description into Georgian, fills the technical and color fields, and attaches its image/video files automatically.
7. Review the Georgian copy, complete any missing category/material information and create the Draft.

Dimensions are deliberately omitted because Hooma pricing uses material weight and print time. Websites expose different data, so the clipper never invents missing technical values. Empty fields remain empty for operator review. Some sites may also prevent direct media downloads; in that case save the permitted media manually and upload it through the existing Hooma media selector.

Georgian translation runs only after an authenticated Admin/Owner imports the package into Hooma. It is powered by [Google Translate](https://translate.google.com); the Google Cloud API key stays in Hooma's server environment and is never embedded in the browser extension or exported JSON. The operator must review the automatic copy before publication.
