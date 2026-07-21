"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { revalidateStorefrontCatalog } from "@/lib/storefront-cache";
import { deleteCatalogProducts } from "@/app/admin/products/actions";
import { productColorNames } from "@/data/product-colors";

export type CatalogAuditActionState = { ok?: boolean; message?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedProductColors = new Set<string>(productColorNames);
const clean = (value: unknown, max = 100) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const normalizedName = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const normalizedDescription = (value: unknown) => String(value ?? "")
  .replace(/\r\n?/g, "\n")
  .replace(/[\t ]+/g, " ")
  .replace(/\n{3,}/g, "\n\n")
  .trim();

function auditApplyError(message: string) {
  if (message.includes("Product changed after audit")) return "პროდუქტი აუდიტის შემდეგ შეიცვალა. შენ მიერ შეტანილი ცვლილებები დაცულია და ძველი აუდიტი ვერ გადაეწერება.";
  if (message.includes("Concurrent audit claim")) return "ამ პროდუქტზე პარალელური აუდიტი დასრულდა. რამდენიმე წამში თავიდან სცადე.";
  if (message.includes("Only ready") || message.includes("already approved")) return "აუდიტის ეს შედეგი უკვე დამუშავებულია. განაახლე გვერდი.";
  if (message.includes("function") || message.includes("schema cache")) return "ჯერ გაუშვი ბოლო Supabase migration და შემდეგ სცადე.";
  return message;
}

async function auditContext() {
  const actor = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  return actor && admin ? { actor, admin } : null;
}

function refreshAudit(productIds: string[] = []) {
  revalidatePath("/admin/catalog-agent");
  revalidatePath("/admin/audit-agent");
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

export async function applyCatalogProductAuditItemAction(
  _state: CatalogAuditActionState,
  formData: FormData,
): Promise<CatalogAuditActionState> {
  const context = await auditContext();
  if (!context) return { message: "აუდიტის დამტკიცების უფლება არ გაქვს." };
  const itemId = clean(formData.get("item_id"), 36);
  if (!uuidPattern.test(itemId)) return { message: "აუდიტის ჩანაწერი არასწორია." };

  const nameKa = normalizedName(formData.get("name_ka"));
  const nameEn = normalizedName(formData.get("name_en"));
  const descriptionKa = normalizedDescription(formData.get("description_ka"));
  const descriptionEn = normalizedDescription(formData.get("description_en"));
  const colorMode = clean(formData.get("color_mode"), 32);
  const colors = Array.from(new Set(formData.getAll("colors").map((value) => clean(value, 60)).filter(Boolean)));
  if (nameKa.length < 2 || nameKa.length > 160 || nameEn.length < 2 || nameEn.length > 160) {
    return { message: "ქართული და ინგლისური სახელები უნდა შეიცავდეს 2-დან 160 სიმბოლომდე." };
  }
  if (descriptionKa.length < 10 || descriptionKa.length > 800 || descriptionEn.length < 10 || descriptionEn.length > 800) {
    return { message: "ქართული და ინგლისური აღწერები უნდა შეიცავდეს 10-დან 800 სიმბოლომდე." };
  }
  if (!["customer_choice", "fixed_multicolor"].includes(colorMode)) {
    return { message: "ფერის რეჟიმი არასწორია." };
  }
  if (colors.some((color) => !allowedProductColors.has(color)) || colors.length < (colorMode === "fixed_multicolor" ? 2 : 1)) {
    return { message: colorMode === "fixed_multicolor" ? "AMS პროდუქტისთვის აირჩიე მინიმუმ ორი ფერი." : "აირჩიე მინიმუმ ერთი ფერი." };
  }

  const submittedUrls = formData.getAll("kept_image_urls").map((value) => String(value ?? "").trim());
  const keptImageUrls = Array.from(new Set(submittedUrls));
  if (
    keptImageUrls.length < 1
    || keptImageUrls.length > 12
    || keptImageUrls.some((url) => url.length > 2_000 || !/^https:\/\//i.test(url))
  ) return { message: "დატოვე 1-დან 12-მდე სწორი HTTPS ფოტო." };

  const { data, error } = await context.admin.rpc("apply_catalog_product_audit_item_v4", {
    actor_profile_id: context.actor.id,
    requested_item_id: itemId,
    requested_kept_image_urls: keptImageUrls,
    requested_name_ka: nameKa,
    requested_name_en: nameEn,
    requested_description_ka: descriptionKa,
    requested_description_en: descriptionEn,
    requested_available_colors: colors,
    requested_color_mode: colorMode,
  });
  if (error) {
    refreshAudit();
    return { message: auditApplyError(clean(error.message, 500)) };
  }
  refreshAudit(data?.product_id ? [data.product_id] : []);
  return { ok: true, message: "პროდუქტის შესწორებები დამტკიცდა." };
}

export async function deleteCatalogProductFromAuditAction(
  _state: CatalogAuditActionState,
  formData: FormData,
): Promise<CatalogAuditActionState> {
  const context = await auditContext();
  if (!context) return { message: "პროდუქტის წაშლის უფლება არ გაქვს." };
  if (clean(formData.get("confirmation"), 30) !== "DELETE_PRODUCT") {
    return { message: "პროდუქტის წაშლა არ დადასტურდა." };
  }
  const itemId = clean(formData.get("item_id"), 36);
  if (!uuidPattern.test(itemId)) return { message: "აუდიტის ჩანაწერი არასწორია." };

  const { data: item } = await context.admin.from("catalog_product_audit_items")
    .select("id,product_id")
    .eq("id", itemId)
    .maybeSingle();
  if (!item?.product_id) return { message: "პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია." };

  const result = await deleteCatalogProducts([item.product_id], { auditItemId: item.id });
  if (!result.ok) return { message: result.message };
  refreshAudit();
  return { ok: true, message: result.message };
}

export async function rejectCatalogProductAuditItemAction(formData: FormData) {
  const context = await auditContext();
  if (!context) return;
  const itemId = clean(formData.get("item_id"), 36);
  if (!uuidPattern.test(itemId)) return;
  const { data: item, error } = await context.admin.from("catalog_product_audit_items").update({
    status: "rejected",
    review_visible: false,
    reviewed_by: context.actor.id,
    reviewed_at: new Date().toISOString(),
    error_message: null,
  })
    .eq("id", itemId)
    .eq("status", "ready")
    .eq("review_visible", true)
    .select("id,job_id,product_id")
    .maybeSingle();
  if (error || !item) return;
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
    .eq("review_visible", true)
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
  const { error } = await context.admin.rpc("cancel_catalog_product_audit_job_v1", {
    actor_profile_id: context.actor.id,
    requested_job_id: jobId,
  });
  if (error) return;
  refreshAudit();
}
