"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { revalidateStorefrontCatalog } from "@/lib/storefront-cache";

export type CatalogAuditActionState = { ok?: boolean; message?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max = 100) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function auditContext() {
  const actor = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  return actor && admin ? { actor, admin } : null;
}

function refreshAudit(productIds: string[] = []) {
  revalidatePath("/admin/catalog-agent");
  revalidatePath("/admin/products");
  for (const productId of productIds) revalidatePath(`/admin/products/${productId}`);
  if (productIds.length) {
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/product/[slug]", "page");
    revalidatePath("/products/[slug]", "page");
    revalidateStorefrontCatalog();
  }
}

export async function createCatalogProductAuditJobAction(
  _state: CatalogAuditActionState,
  formData: FormData,
): Promise<CatalogAuditActionState> {
  const context = await auditContext();
  if (!context) return { message: "პროდუქტების აუდიტის შექმნის უფლება არ გაქვს." };
  const agentId = clean(formData.get("agent_id"), 36);
  if (!uuidPattern.test(agentId)) return { message: "აირჩიე აქტიური Catalog Agent." };

  const allowedStatuses = new Set(["active", "draft", "archived", "coming_soon"]);
  const statuses = formData.getAll("product_statuses").map((value) => clean(value, 30)).filter((value) => allowedStatuses.has(value));
  if (!statuses.length) return { message: "აირჩიე მინიმუმ ერთი პროდუქტის სტატუსი." };

  const { data, error } = await context.admin.rpc("create_catalog_product_audit_job_v1", {
    actor_profile_id: context.actor.id,
    requested_agent_id: agentId,
    requested_product_statuses: Array.from(new Set(statuses)),
  });
  if (error || !data?.id) {
    const migrationMissing = error?.message?.includes("function") || error?.message?.includes("schema cache");
    return { message: migrationMissing ? "ჯერ გაუშვი Catalog Product Auditor-ის Supabase migration." : error?.message ?? "აუდიტის დავალება ვერ შეიქმნა." };
  }
  refreshAudit();
  return { ok: true, message: `აუდიტის რიგში დაემატა ${Number(data.total_count ?? 0).toLocaleString("ka-GE")} პროდუქტი.` };
}

export async function applyCatalogProductAuditItemAction(formData: FormData) {
  const context = await auditContext();
  if (!context) return;
  const itemId = clean(formData.get("item_id"), 36);
  if (!uuidPattern.test(itemId)) return;
  const { data, error } = await context.admin.rpc("apply_catalog_product_audit_item_v1", {
    actor_profile_id: context.actor.id,
    requested_item_id: itemId,
  });
  if (error) {
    await context.admin.from("catalog_product_audit_items").update({ error_message: clean(error.message, 500) }).eq("id", itemId);
    refreshAudit();
    return;
  }
  refreshAudit(data?.product_id ? [data.product_id] : []);
}

export async function rejectCatalogProductAuditItemAction(formData: FormData) {
  const context = await auditContext();
  if (!context) return;
  const itemId = clean(formData.get("item_id"), 36);
  if (!uuidPattern.test(itemId)) return;
  const { data: item } = await context.admin.from("catalog_product_audit_items")
    .select("id,job_id,product_id,status")
    .eq("id", itemId)
    .maybeSingle();
  if (!item || item.status !== "ready") return;
  await context.admin.from("catalog_product_audit_items").update({
    status: "rejected",
    reviewed_by: context.actor.id,
    reviewed_at: new Date().toISOString(),
    error_message: null,
  }).eq("id", item.id).eq("status", "ready");
  await Promise.all([
    context.admin.rpc("refresh_catalog_product_audit_job_counters", { requested_job_id: item.job_id }),
    context.admin.from("audit_log").insert({
      actor_id: context.actor.id,
      action: "catalog_product_audit_rejected",
      entity_type: "product",
      entity_id: item.product_id,
      metadata: { audit_item_id: item.id, audit_job_id: item.job_id },
    }),
  ]);
  refreshAudit();
}

export async function applyHighConfidenceCatalogAuditsAction(
  _state: CatalogAuditActionState,
  formData: FormData,
): Promise<CatalogAuditActionState> {
  const context = await auditContext();
  if (!context) return { message: "აუდიტის შედეგების დამტკიცების უფლება არ გაქვს." };
  const jobId = clean(formData.get("job_id"), 36);
  if (!uuidPattern.test(jobId) || clean(formData.get("confirmation"), 20) !== "APPLY") {
    return { message: "მასობრივი დამტკიცებისთვის ჩაწერე APPLY." };
  }

  const { data: candidates, error } = await context.admin.from("catalog_product_audit_items")
    .select("id,product_id,warnings")
    .eq("job_id", jobId)
    .eq("status", "ready")
    .gte("confidence", 0.85)
    .order("confidence", { ascending: false })
    .limit(100);
  if (error) return { message: error.message };
  const safeCandidates = (candidates ?? []).filter((item: any) => !Array.isArray(item.warnings) || item.warnings.length === 0);
  if (!safeCandidates.length) return { message: "დარჩენილი მაღალი სანდოობის, გაფრთხილების გარეშე შედეგი არ არის." };

  const appliedProducts: string[] = [];
  let failed = 0;
  for (let offset = 0; offset < safeCandidates.length; offset += 5) {
    const batch = safeCandidates.slice(offset, offset + 5);
    const results = await Promise.all(batch.map((item: any) => context.admin.rpc("apply_catalog_product_audit_item_v1", {
      actor_profile_id: context.actor.id,
      requested_item_id: item.id,
    })));
    results.forEach((result: any, index: number) => {
      if (result.error) failed += 1;
      else appliedProducts.push(result.data?.product_id ?? batch[index].product_id);
    });
  }
  refreshAudit(appliedProducts);
  return {
    ok: appliedProducts.length > 0,
    message: `დამტკიცდა ${appliedProducts.length} პროდუქტი${failed ? ` · ვერ დამტკიცდა ${failed}` : ""}. ერთ ჯერზე მაქსიმუმ 100 პროდუქტი მუშავდება.`,
  };
}

export async function cancelCatalogProductAuditJobAction(formData: FormData) {
  const context = await auditContext();
  if (!context) return;
  const jobId = clean(formData.get("job_id"), 36);
  if (!uuidPattern.test(jobId)) return;
  await context.admin.from("catalog_product_audit_jobs").update({
    status: "cancelled",
    completed_at: new Date().toISOString(),
  }).eq("id", jobId).in("status", ["queued", "running"]);
  await context.admin.from("audit_log").insert({
    actor_id: context.actor.id,
    action: "catalog_product_audit_job_cancelled",
    entity_type: "catalog_product_audit_job",
    entity_id: jobId,
    metadata: {},
  });
  refreshAudit();
}
