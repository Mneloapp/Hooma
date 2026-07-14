# Hooma MakerWorld Importer

Chrome/Edge extension that reads only public catalog and selected print-profile data from the MakerWorld page currently open by the operator. It never reads or exports cookies, passwords, access tokens, downloaded model files, or Bambu printer credentials.

## Install for development

1. Pull the latest Hooma branch.
2. Open `chrome://extensions` (or `edge://extensions`).
3. Enable **Developer mode**.
4. Choose **Load unpacked**.
5. Select the `tools/hooma-makerworld-importer` directory.

## Import flow

1. Open the exact MakerWorld model URL, including `#profileId-...`.
2. Select the print profile Hooma will manufacture and wait until the profile data is visible.
3. Open the extension and click **Hooma-ს მონაცემების მომზადება**.
4. Return to the matching Hooma Import Review page.
5. Click **იმპორტერიდან შევსება** and review every populated value before creating the product Draft.

MakerWorld can change its internal response shape at any time. The importer therefore reports missing fields and keeps the operator confirmation gate. A missing or uncertain field is never fabricated.
