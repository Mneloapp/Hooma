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
3. Review/correct the extracted fields and select up to 12 images.
4. Download the Hooma JSON and selected images.
5. In Hooma open **Admin → პროდუქტები → ახალი პროდუქტი**.
6. Import the `.hooma.json` file, select the downloaded image/video files, complete any missing category/material/color information, and create the Draft.

Websites expose different data, so the clipper never invents missing technical values. Empty fields remain empty for operator review. Some sites may also prevent direct media downloads; in that case save the permitted media manually and upload it through the existing Hooma media selector.
