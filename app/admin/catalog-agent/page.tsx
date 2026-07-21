import { redirect } from "next/navigation";
import { CatalogAgentConsole } from "@/components/admin/CatalogAgentConsole";
import { CatalogProductAuditConsole } from "@/components/admin/CatalogProductAuditConsole";
import { buildCategoryOptions, type CategoryRow } from "@/lib/catalog-categories";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export default async function CatalogAgentPage() {
  const actor = await requirePermission("catalog.manage");
  if (!actor) redirect("/login?next=/admin/catalog-agent");
  const admin = createAdminClient() as any;
  const [agentResult, categoryResult, jobResult, itemResult, auditJobResult, readyAuditItemResult, failedAuditItemResult, auditSchemaResult] = admin ? await Promise.all([
    admin.from("catalog_agents").select("id,name,token_prefix,is_active,last_seen_at,created_at").order("created_at", { ascending: false }),
    admin.from("categories").select("id,parent_id,slug,name_en,name_ka,sort_order").eq("is_active", true).order("sort_order"),
    admin.from("catalog_agent_jobs").select("*").order("created_at", { ascending: false }).limit(50),
    admin.from("catalog_agent_items").select("id,job_id,source_url,source_title,status,product_id,source_import_id,error_message,processed_at").order("updated_at", { ascending: false }).limit(50),
    admin.from("catalog_product_audit_jobs").select("*").order("created_at", { ascending: false }).limit(20),
    admin.from("catalog_product_audit_items").select("id,job_id,product_id,status,current_snapshot,suggestion,confidence,warnings,model_name,error_message,processed_at").eq("review_visible", true).eq("status", "ready").order("updated_at", { ascending: false }).limit(100),
    admin.from("catalog_product_audit_items").select("id,job_id,product_id,status,current_snapshot,suggestion,confidence,warnings,model_name,error_message,processed_at").eq("review_visible", true).eq("status", "failed").order("updated_at", { ascending: false }).limit(20),
    admin.from("products").select("catalog_audit_attempted_at").limit(1),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const categories = buildCategoryOptions((categoryResult.data ?? []) as CategoryRow[]).map(({ id, name }) => ({ id, name }));
  const auditItems = [...(readyAuditItemResult.data ?? []), ...(failedAuditItemResult.data ?? [])] as any[];
  const auditProductIds = Array.from(new Set(auditItems.map((item) => item.product_id).filter(Boolean)));
  const auditProductResult = admin && auditProductIds.length
    ? await admin.from("products")
      .select("id,slug,product_variants(id,is_active,available_colors,attributes)")
      .in("id", auditProductIds)
    : { data: [], error: null };
  const auditProducts = new Map((auditProductResult.data ?? []).map((product: any) => [product.id, product]));
  const enrichedAuditItems = auditItems.map((item) => {
    const product: any = auditProducts.get(item.product_id);
    const variants = Array.isArray(product?.product_variants) ? product.product_variants : [];
    const snapshotVariantId = item.current_snapshot?.variant_id;
    const variant = variants.find((candidate: any) => candidate.id === snapshotVariantId)
      ?? variants.find((candidate: any) => candidate.is_active)
      ?? variants[0];
    const attributes = variant?.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes)
      ? variant.attributes
      : {};
    const fixedPalette = Array.isArray(attributes.fixed_color_palette)
      ? attributes.fixed_color_palette.filter((color: unknown): color is string => typeof color === "string")
      : [];
    const availableColors = Array.isArray(variant?.available_colors)
      ? variant.available_colors.filter((color: unknown): color is string => typeof color === "string")
      : [];
    const fixedMulticolor = attributes.ams_required === true && attributes.color_mode === "fixed_multicolor";
    return {
      ...item,
      product_slug: product?.slug ?? null,
      color_mode: fixedMulticolor ? "fixed_multicolor" : "customer_choice",
      available_colors: fixedMulticolor ? fixedPalette : availableColors,
    };
  });

  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Automation</p><h1 className="mt-3 text-4xl font-medium">Catalog Agent</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">მიეცი აგენტს კატეგორიის გვერდი. ის იპოვის პროდუქტებს, გამოიყენებს Hooma Clipper-ის extraction engine-ს და შექმნის მხოლოდ შესამოწმებელ Draft-ებს.</p></div>
      <CatalogAgentConsole
        agents={(agentResult.data ?? []) as any}
        categories={categories}
        jobs={(jobResult.data ?? []) as any}
        items={(itemResult.data ?? []) as any}
        canManageAgents={hasPermission(actor.role, "team.manage")}
        migrationReady={!agentResult.error && !jobResult.error && !itemResult.error}
      />
      <CatalogProductAuditConsole
        agents={(agentResult.data ?? []) as any}
        jobs={(auditJobResult.data ?? []) as any}
        items={enrichedAuditItems as any}
        migrationReady={!auditJobResult.error && !readyAuditItemResult.error && !failedAuditItemResult.error && !auditSchemaResult.error && !auditProductResult.error}
      />
    </div>
  );
}
