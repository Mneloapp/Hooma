import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const categoryMigrationPath = new URL(
  "../supabase/migrations/20260729000200_catalog_audit_category_scope.sql",
  import.meta.url,
);
const storefrontMigrationPath = new URL(
  "../supabase/migrations/20260729000300_manager_approved_storefront_gate.sql",
  import.meta.url,
);

const [categoryMigration, storefrontMigration] = await Promise.all([
  readFile(categoryMigrationPath, "utf8"),
  readFile(storefrontMigrationPath, "utf8"),
]);

test("category job creation and claim use the same persisted scope", () => {
  assert.match(categoryMigration, /create_catalog_product_audit_job_v3/);
  assert.match(categoryMigration, /category_scope_ids uuid\[\]/);
  assert.match(
    categoryMigration,
    /product\.category_id = any\(resolved_category_scope\)/,
  );
  assert.match(
    categoryMigration,
    /product\.category_id = any\(selected_job\.category_scope_ids\)/,
  );
});

test("overlapping live category jobs are serialized and rejected", () => {
  assert.match(
    categoryMigration,
    /pg_advisory_xact_lock\(hashtext\('hooma-catalog-audit-category-scope'\)\)/,
  );
  assert.match(
    categoryMigration,
    /existing_job\.category_scope_ids && resolved_category_scope/,
  );
  assert.match(
    categoryMigration,
    /create_catalog_product_audit_job_v2[\s\S]*A catalog audit job is already active/,
  );
  assert.match(
    categoryMigration,
    /revoke execute on function public\.create_catalog_product_audit_job_v1/,
  );
});

test("job count and claim share snapshot and auditable-product prechecks", () => {
  assert.match(
    categoryMigration,
    /job_snapshot_at timestamptz := now\(\)/,
  );
  assert.match(
    categoryMigration,
    /product\.created_at, '-infinity'::timestamptz\) <= job_snapshot_at/,
  );
  assert.ok(
    categoryMigration.match(/variant\.is_active = true/g)?.length >= 3,
    "v3, rolling v2, and claim must all require an active variant",
  );
  assert.ok(
    categoryMigration.match(/gallery\.image_url like 'https:\/\/%'/g)?.length >= 3,
    "v3, rolling v2, and claim must all require auditable HTTPS media",
  );
  assert.match(
    categoryMigration,
    /No unaudited products are available in this category scope/,
  );
});

test("storefront visibility requires manager application, not AI completion alone", () => {
  const visibilityFunction = storefrontMigration.match(
    /create or replace function public\.is_storefront_product_visible_v1[\s\S]*?\$\$;/,
  )?.[0];
  assert.ok(visibilityFunction, "canonical storefront visibility function is missing");
  assert.match(
    storefrontMigration,
    /product\.catalog_audit_applied_at is not null/,
  );
  assert.doesNotMatch(
    visibilityFunction,
    /catalog_audit_completed_at/,
  );
  assert.match(
    storefrontMigration,
    /A manager-approved catalog audit is required before publication/,
  );
});

test("checkout pricing and Daily Deals share the canonical visibility gate", () => {
  assert.match(
    storefrontMigration,
    /if not public\.is_storefront_product_visible_v1\(requested_product_id\)/,
  );
  assert.match(
    storefrontMigration,
    /where public\.is_storefront_product_visible_v1\(product\.id\)/,
  );
  assert.match(
    storefrontMigration,
    /not public\.is_storefront_product_visible_v1\(deal\.product_id\)/,
  );
  assert.match(
    storefrontMigration,
    /variant\.id = deal\.variant_id[\s\S]*variant\.is_active = true[\s\S]*deal\.original_price = coalesce/,
  );
});

test("post-approval catalog changes invalidate approval and delete the public card", () => {
  assert.match(
    storefrontMigration,
    /create or replace function public\.invalidate_catalog_audit_on_product_content_v1/,
  );
  assert.match(
    storefrontMigration,
    /new\.catalog_audit_applied_at := null;[\s\S]*new\.catalog_audit_applied_item_id := null;/,
  );
  assert.ok(
    storefrontMigration.match(/old\.catalog_audit_applied_(?:at|item_id) is not null/g)?.length >= 2,
    "content invalidation must run only after a complete manager-applied marker",
  );
  assert.match(
    storefrontMigration,
    /where id = requested_product_id[\s\S]*catalog_audit_applied_at is not null[\s\S]*catalog_audit_applied_item_id is not null;/,
  );
  assert.match(
    storefrontMigration,
    /create function public\.refresh_storefront_product_card_v1[\s\S]*catalog_audit_applied_at is not null[\s\S]*catalog_audit_applied_item_id is not null[\s\S]*delete from public\.storefront_product_cards/,
  );
  assert.match(
    storefrontMigration,
    /current_setting\('hooma\.catalog_audit_apply_product_id', true\) is distinct from old\.id::text/,
  );
  assert.match(
    storefrontMigration,
    /if coalesce\(new\.is_active, false\)[\s\S]*not coalesce\(old\.is_active, false\)[\s\S]*new_product_id is distinct from old_product_id/,
  );
});
