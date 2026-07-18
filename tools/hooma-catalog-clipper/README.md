# Hooma Catalog Clipper

Chrome/Edge Manifest V3 extension that reads the public product information visible on the page currently open by the operator. It uses JSON-LD, Open Graph metadata and visible page content, then exports an allow-listed `hooma-catalog-clipper-v1` JSON draft. MakerWorld Assisted Mode can also send operator-reviewed results directly into an assigned Hooma Catalog Agent job.

The extension has no Supabase credentials, does not read page cookies/passwords, does not bypass website access controls, and cannot publish a product. Assisted Mode uses one narrowly scoped, revocable Catalog Agent token stored only in the current Chrome profile. An authenticated Hooma admin must still review every Draft and decide whether to publish it.

## Install

1. Pull the latest Hooma branch.
2. Chrome: open `chrome://extensions`. Edge: open `edge://extensions`.
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `tools/hooma-catalog-clipper` directory.

The package has a stable extension identity and keeps its Agent token in this Chrome profile's local extension storage. For code updates use **Reload** on `chrome://extensions`; do not remove the extension. Removing it clears Chrome's local storage. If the token is ever lost, an Owner can open Hooma Admin → Catalog Agent → registered agent → **ახალი token-ის შექმნა**. The old token is invalidated immediately and the replacement is shown once for copying into the Clipper.

## Product flow

1. Open a product page in Chrome/Edge and wait until its content is visible.
2. To avoid a cloud translation request, use Chrome's **Translate to Georgian** on the page and wait until the visible product copy changes.
3. Open **Hooma Catalog Clipper** and choose **გახსნილი გვერდის წაკითხვა**. The clipper prioritizes the visible translated title and description over untranslated JSON-LD/Open Graph metadata. For category detection it reads the breadcrumb first, then visible category links/chips and canonicalizes a recognized match to Hooma's Georgian category tree. On MakerWorld it also reads the selected print profile's same-origin metadata to fill the dominant material, total filament weight and print prediction; other sites use visible English/Georgian technical labels and profile blocks.
4. Review/correct the visible category path, material, weight, print hours and remaining minutes; choose the customer color choices or one fixed AMS color composition; then select up to 12 images.
5. Choose **სრული პაკეტის ჩამოტვირთვა**. JSON and media are saved together under `Downloads/hooma-import/<product-name>`.
6. In Hooma open **Admin → პროდუქტები → ახალი პროდუქტი**.
7. Choose the downloaded product package folder once. Hooma matches the extracted category/subcategory path against its active 11-category/58-subcategory tree, fills the technical and color fields and attaches its image/video files automatically. Copy already captured in Georgian skips the Google Cloud translation request; non-Georgian copy can still use the configured server translation fallback.
8. Review the Georgian copy, complete any missing category/material information and create the Draft.

## MakerWorld Auto Queue Mode V2

Use a separate Catalog Agent identity for this mode. Do not reuse the token already running in `tools/hooma-catalog-agent`, because both clients could otherwise claim the same assigned job.

1. In Hooma Admin → Catalog Agent register a new identity, for example `Hooma MakerWorld Assisted · Windows 01`, and copy its one-time token.
2. Open MakerWorld once in the same ordinary Chrome profile. If it asks for human verification, complete it yourself and wait until a normal catalog/product page is visible. If Georgian Draft copy is required, enable Chrome's **Always translate English to Georgian** before starting the queue.
3. In Hooma Admin create one or more MakerWorld category jobs assigned to this agent.
4. Open the Clipper and save the Agent token once. It remains only in this Chrome profile's extension storage; never paste a Supabase key here.
5. Choose **Start** in **Auto Queue Mode V2**. The popup may be closed: the Manifest V3 background worker keeps its state in `chrome.storage.local`, claims the next assigned job, opens one pinned managed tab, scrolls/discovers its category, and processes one product at a time.
6. If MakerWorld asks for verification later, the worker preserves the current job/item, pauses, focuses the managed tab, shows a notification and marks the extension badge with `!`. Complete the verification yourself and choose **Resume**.
7. **Pause** preserves the exact queue position. **Stop** disables polling while preserving the current position; **Start** continues it later.
8. Review every resulting Draft and Import Review record in Hooma Admin. The extension cannot publish; Admin/Owner review and publication confirmation remain required.

The extension prevents repeated extraction at two levels. Locally it remembers successfully processed source identities. Hooma also checks every discovered/claimed item against all existing `source_imports` and `product_sources` using the stable platform + model ID (with canonical URL fallback), so a model already extracted by another job or machine is skipped before its product page opens. A final idempotency check runs when the Draft is submitted.

Auto Queue never solves CAPTCHA, changes browser fingerprints, exports cookies, or bypasses access controls. It only continues after a human completes verification in the normal Chrome tab. Revoke the Agent in Hooma Admin if the Windows machine or Chrome profile is no longer trusted.

## Manual Mode

The previous operator-controlled workflow remains under **Manual Mode-ის კონტროლები**. Use it when you want to capture only currently visible category links, open one claimed product, review/edit the extracted fields inside the Clipper and explicitly send that Draft. Manual and Auto controls are mutually exclusive while Auto Queue is running.

Dimensions are deliberately omitted because Hooma pricing uses material weight and print time. The category path comes from the visible breadcrumb first, so a page translated by Chrome exports the category labels shown to the operator. Websites expose different data, so the clipper never invents missing technical values. Empty fields remain empty for operator review. Some sites may also prevent direct media downloads; in that case save the permitted media manually and upload it through the existing Hooma media selector.

If the clipper package still contains non-Georgian product copy, translation runs only after an authenticated Admin/Owner imports it into Hooma. The optional Google Cloud API key stays in Hooma's server environment and is never embedded in the browser extension or exported JSON. The operator must review all copy before publication.
