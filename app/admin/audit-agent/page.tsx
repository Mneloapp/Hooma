import { redirect } from "next/navigation";
import { CatalogProductAuditConsole } from "@/components/admin/CatalogProductAuditConsole";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export default async function AuditAgentPage() {
  const actor = await requirePermission("catalog.manage");
  if (!actor) redirect("/login?next=/admin/audit-agent");
  const admin = createAdminClient() as any;
  const [agentResult, auditJobResult, readyResult, failedResult, schemaResult] = admin ? await Promise.all([
    admin.from("catalog_agents").select("id,name,token_prefix,is_active,last_seen_at,created_at").order("created_at", { ascending: false }),
    admin.from("catalog_product_audit_jobs").select("*").order("created_at", { ascending: false }).limit(20),
    admin.from("catalog_product_audit_items").select("id,job_id,product_id,status,current_snapshot,suggestion,confidence,warnings,model_name,error_message,processed_at").eq("review_visible", true).eq("status", "ready").order("updated_at", { ascending: false }).limit(100),
    admin.from("catalog_product_audit_items").select("id,job_id,product_id,status,current_snapshot,suggestion,confidence,warnings,model_name,error_message,processed_at").eq("review_visible", true).eq("status", "failed").order("updated_at", { ascending: false }).limit(20),
    admin.from("products").select("catalog_audit_attempted_at").limit(1),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }, { data: [] }];

  const items = [...(readyResult.data ?? []), ...(failedResult.data ?? [])] as any[];
  const productIds = Array.from(new Set(items.map((item) => item.product_id).filter(Boolean)));
  const productResult = admin && productIds.length
    ? await admin.from("products").select("id,slug,product_variants(id,is_active,available_colors,attributes)").in("id", productIds)
    : { data: [], error: null };
  const products = new Map((productResult.data ?? []).map((product: any) => [product.id, product]));
  const enrichedItems = items.map((item) => {
    const product: any = products.get(item.product_id);
    const variants = Array.isArray(product?.product_variants) ? product.product_variants : [];
    const variant = variants.find((candidate: any) => candidate.id === item.current_snapshot?.variant_id)
      ?? variants.find((candidate: any) => candidate.is_active)
      ?? variants[0];
    const attributes = variant?.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes) ? variant.attributes : {};
    const fixedPalette = Array.isArray(attributes.fixed_color_palette) ? attributes.fixed_color_palette.filter((color: unknown): color is string => typeof color === "string") : [];
    const availableColors = Array.isArray(variant?.available_colors) ? variant.available_colors.filter((color: unknown): color is string => typeof color === "string") : [];
    const fixedMulticolor = attributes.ams_required === true && attributes.color_mode === "fixed_multicolor";
    return { ...item, product_slug: product?.slug ?? null, color_mode: fixedMulticolor ? "fixed_multicolor" : "customer_choice", available_colors: fixedMulticolor ? fixedPalette : availableColors };
  });

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Manager-reviewed catalog copy</p><h1 className="mt-3 text-4xl font-medium">Audit Agent</h1><p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">AI თითო პროდუქტზე იყენებს მხოლოდ ერთ მთავარ ფოტოს, ასწორებს ქართულ/ინგლისურ სახელსა და აღწერას და აფასებს მიახლოებით ზომას. ფოტოები, ფერები და AMS უცვლელად რჩება; საბოლოო ცვლილებას ყოველთვის მენეჯერი ამოწმებს და ამტკიცებს.</p></div>
      <CatalogProductAuditConsole
        agents={(agentResult.data ?? []) as any}
        jobs={(auditJobResult.data ?? []) as any}
        items={enrichedItems as any}
        migrationReady={!auditJobResult.error && !readyResult.error && !failedResult.error && !schemaResult.error && !productResult.error}
      />
    </div>
  );
}
