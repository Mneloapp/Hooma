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
const bulkDraftMigrationPath = new URL(
  "../supabase/migrations/20260729000400_bulk_draft_catalog.sql",
  import.meta.url,
);
const adminCatalogPerformanceMigrationPath = new URL(
  "../supabase/migrations/20260729000500_admin_catalog_performance.sql",
  import.meta.url,
);
const fastBulkDraftMigrationPath = new URL(
  "../supabase/migrations/20260729000600_fast_bulk_draft_catalog.sql",
  import.meta.url,
);
const batchedBulkDraftMigrationPath = new URL(
  "../supabase/migrations/20260729000700_batched_bulk_draft_catalog.sql",
  import.meta.url,
);
const bulkDraftTimeoutMigrationPath = new URL(
  "../supabase/migrations/20260729000800_bulk_draft_batch_timeout.sql",
  import.meta.url,
);
const safeBulkDraftCleanupMigrationPath = new URL(
  "../supabase/migrations/20260729000900_safe_bulk_draft_cleanup.sql",
  import.meta.url,
);
const managerMediaMigrationPath = new URL(
  "../supabase/migrations/20260731000100_manager_media_preserves_audit.sql",
  import.meta.url,
);
const managerCatalogEditMigrationPath = new URL(
  "../supabase/migrations/20260801000100_manager_catalog_edits_preserve_audit.sql",
  import.meta.url,
);
const adminProductsPagePath = new URL("../app/admin/products/page.tsx", import.meta.url);
const adminPermissionsPath = new URL("../lib/auth/permissions.ts", import.meta.url);
const productMediaActionsPath = new URL("../app/admin/products/media-actions.ts", import.meta.url);

const [categoryMigration, storefrontMigration, bulkDraftMigration, adminCatalogPerformanceMigration, fastBulkDraftMigration, batchedBulkDraftMigration, bulkDraftTimeoutMigration, safeBulkDraftCleanupMigration, managerMediaMigration, managerCatalogEditMigration, adminProductsPage, adminPermissions, productMediaActions] = await Promise.all([
  readFile(categoryMigrationPath, "utf8"),
  readFile(storefrontMigrationPath, "utf8"),
  readFile(bulkDraftMigrationPath, "utf8"),
  readFile(adminCatalogPerformanceMigrationPath, "utf8"),
  readFile(fastBulkDraftMigrationPath, "utf8"),
  readFile(batchedBulkDraftMigrationPath, "utf8"),
  readFile(bulkDraftTimeoutMigrationPath, "utf8"),
  readFile(safeBulkDraftCleanupMigrationPath, "utf8"),
  readFile(managerMediaMigrationPath, "utf8"),
  readFile(managerCatalogEditMigrationPath, "utf8"),
  readFile(adminProductsPagePath, "utf8"),
  readFile(adminPermissionsPath, "utf8"),
  readFile(productMediaActionsPath, "utf8"),
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

test("manager media editor preserves approval and repairs media-only invalidations", () => {
  assert.match(managerMediaMigration, /create or replace function public\.update_manager_reviewed_product_media_v1/);
  assert.match(managerMediaMigration, /set_config\([\s\S]*hooma\.catalog_audit_apply_product_id/);
  assert.match(managerMediaMigration, /update public\.product_variants[\s\S]*set image = requested_hero_image/);
  assert.match(managerMediaMigration, /grant execute on function public\.update_manager_reviewed_product_media_v1[\s\S]*to service_role/);
  assert.match(managerMediaMigration, /latest_content_action\.action = 'product_media_updated'/);
  assert.match(managerMediaMigration, /catalog_audit_restored_after_manager_media_edit/);
  assert.match(productMediaActions, /\.rpc\([\s\S]*update_manager_reviewed_product_media_v1/);
  assert.match(productMediaActions, /revalidatePath\("\/admin\/audited-products"\)/);
  assert.doesNotMatch(productMediaActions, /from\("products"\)\.update\(\{\s*hero_image/);
});

test("manager catalog editor preserves approval and repairs editor invalidations", () => {
  assert.match(managerCatalogEditMigration, /rename to update_catalog_product_v2_core_20260801/);
  assert.match(managerCatalogEditMigration, /revoke all on function public\.update_catalog_product_v2_core_20260801[\s\S]*service_role/);
  assert.match(managerCatalogEditMigration, /set_config\([\s\S]*hooma\.catalog_audit_apply_product_id/);
  assert.match(managerCatalogEditMigration, /update_catalog_product_v2_core_20260801\(/);
  assert.match(managerCatalogEditMigration, /exception when others then[\s\S]*coalesce\(previous_apply_product_id, ''\)/);
  assert.match(managerCatalogEditMigration, /grant execute on function public\.update_catalog_product_v2[\s\S]*to service_role/);
  assert.match(managerCatalogEditMigration, /latest_content_action\.action = 'catalog_product_updated'/);
  assert.match(managerCatalogEditMigration, /catalog_audit_restored_after_manager_catalog_edit/);
});

test("bulk Draft reset is explicit, privileged, and preserves audit approval", () => {
  assert.match(
    bulkDraftMigration,
    /role in \('owner', 'admin'\)/,
  );
  assert.match(
    bulkDraftMigration,
    /confirmation_token is distinct from 'MOVE_ALL_PRODUCTS_TO_DRAFT'/,
  );
  assert.match(
    bulkDraftMigration,
    /update public\.products[\s\S]*set status = 'draft'/,
  );
  assert.doesNotMatch(
    bulkDraftMigration,
    /set[\s\S]{0,300}catalog_audit_(?:attempted|completed|applied)_[a-z_]+\s*=\s*null/,
  );
  assert.match(
    bulkDraftMigration,
    /'audit_markers_preserved', true/,
  );
  assert.match(
    bulkDraftMigration,
    /perform public\.activate_daily_deals/,
  );
});

test("large admin catalog avoids unused counts and uses indexed compact pages", () => {
  assert.match(adminProductsPage, /const ADMIN_PRODUCTS_PER_PAGE = 50/);
  assert.match(adminProductsPage, /get_admin_catalog_counts_v1/);
  assert.match(adminProductsPage, /approvedOnly \? Promise\.resolve\(emptyCounts\)/);
  assert.match(adminCatalogPerformanceMigration, /count\(\*\) filter \(where status = 'draft'\)/);
  assert.match(adminCatalogPerformanceMigration, /idx_products_admin_status_created/);
  assert.match(adminCatalogPerformanceMigration, /idx_products_admin_category_created/);
  assert.match(adminCatalogPerformanceMigration, /idx_products_admin_audit_applied_created/);
  assert.match(adminCatalogPerformanceMigration, /gin_trgm_ops/);
});

test("audited products route is allowed by admin middleware permissions", () => {
  assert.match(
    adminPermissions,
    /\["\/admin\/audited-products", "catalog\.manage"\]/,
  );
});

test("bulk Draft reset skips row refresh work and cleans storefront state in sets", () => {
  assert.match(
    fastBulkDraftMigration,
    /current_setting\('hooma\.bulk_catalog_draft_reset', true\) = 'on'/,
  );
  assert.match(
    fastBulkDraftMigration,
    /set_config\('hooma\.bulk_catalog_draft_reset', 'on', true\)/,
  );
  assert.match(fastBulkDraftMigration, /delete from public\.storefront_product_cards;/);
  assert.match(
    fastBulkDraftMigration,
    /delete from public\.daily_deal_items[\s\S]*where deal_date = current_deal_date;/,
  );
  assert.doesNotMatch(
    fastBulkDraftMigration,
    /set[\s\S]{0,300}catalog_audit_(?:attempted|completed|applied)_[a-z_]+\s*=\s*null/,
  );
});

test("whole-catalog Draft reset is split into bounded transactions", () => {
  assert.match(batchedBulkDraftMigration, /requested_batch_size integer default 2000/);
  assert.match(batchedBulkDraftMigration, /limit resolved_batch_size[\s\S]*for update skip locked/);
  assert.match(batchedBulkDraftMigration, /status is distinct from 'draft'/);
  assert.match(batchedBulkDraftMigration, /'remaining_count', remaining_total/);
  assert.match(batchedBulkDraftMigration, /delete from public\.storefront_product_cards[\s\S]*product_id = any\(selected_product_ids\)/);
});

test("bulk Draft batches have a scoped timeout override", () => {
  assert.match(
    bulkDraftTimeoutMigration,
    /alter function public\.move_catalog_products_to_draft_batch_v1\(uuid, text, integer\)/,
  );
  assert.match(bulkDraftTimeoutMigration, /set statement_timeout = '30s'/);
});

test("final Draft cleanup satisfies the safe-update WHERE requirement", () => {
  assert.doesNotMatch(
    safeBulkDraftCleanupMigration,
    /delete from public\.storefront_product_cards\s*;/,
  );
  assert.match(
    safeBulkDraftCleanupMigration,
    /delete from public\.storefront_product_cards card[\s\S]*where exists \([\s\S]*product\.status = 'draft'/,
  );
  assert.match(
    safeBulkDraftCleanupMigration,
    /set statement_timeout = '30s'/,
  );
});
