import { NextResponse } from "next/server";
import { authenticateCatalogAgent, catalogAgentHasScope, catalogProductAuditJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const safeImages = (hero: unknown, gallery: unknown) => Array.from(new Set<string>([
  ...(typeof hero === "string" && hero.startsWith("https://") ? [hero] : []),
  ...(Array.isArray(gallery) ? gallery.filter((url): url is string => typeof url === "string" && url.startsWith("https://")) : []),
])).slice(0, 12);

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!catalogAgentHasScope(context.agent, "audits:process")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const { jobId } = await params;
  const job = await catalogProductAuditJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Audit job not available" }, { status: 404 });

  const { data: item, error } = await context.admin.rpc("claim_catalog_product_audit_item", {
    requested_agent_id: context.agent.id,
    requested_job_id: job.id,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!item) return NextResponse.json({ ok: true, item: null });

  const [{ data: product }, { data: variants }, { data: category }] = await Promise.all([
    context.admin.from("products")
      .select("id,slug,hooma_name,name_ka,short_description,short_description_ka,long_description,long_description_ka,hero_image,gallery_images,status,category_id,updated_at")
      .eq("id", item.product_id)
      .maybeSingle(),
    context.admin.from("product_variants")
      .select("id,size_label,product_dimensions_cm,updated_at")
      .eq("product_id", item.product_id)
      .eq("is_active", true)
      .order("created_at")
      .limit(1),
    context.admin.from("products")
      .select("categories(name_en,name_ka)")
      .eq("id", item.product_id)
      .maybeSingle(),
  ]);
  const variant = variants?.[0] ?? null;
  if (!product || !variant) {
    await context.admin.from("catalog_product_audit_items").update({
      status: "skipped",
      error_message: "Product or active variant is missing",
      processed_at: new Date().toISOString(),
    }).eq("id", item.id).eq("job_id", job.id);
    await context.admin.rpc("refresh_catalog_product_audit_job_counters", { requested_job_id: job.id });
    return NextResponse.json({ ok: true, item: null, skipped: true, continueClaiming: true });
  }

  const images = safeImages(product.hero_image, product.gallery_images);
  if (!images.length) {
    await context.admin.from("catalog_product_audit_items").update({
      status: "skipped",
      current_snapshot: {
        product_updated_at: product.updated_at,
        variant_id: variant.id,
        variant_updated_at: variant.updated_at,
      },
      error_message: "Product has no auditable HTTPS images",
      processed_at: new Date().toISOString(),
    }).eq("id", item.id).eq("job_id", job.id);
    await context.admin.rpc("refresh_catalog_product_audit_job_counters", { requested_job_id: job.id });
    return NextResponse.json({ ok: true, item: null, skipped: true, continueClaiming: true });
  }

  const categoryRow = Array.isArray(category?.categories) ? category.categories[0] : category?.categories;
  const snapshot = {
    product_updated_at: product.updated_at,
    variant_id: variant.id,
    variant_updated_at: variant.updated_at,
    name_ka: product.name_ka || product.hooma_name || "",
    description_ka: product.short_description_ka || product.long_description_ka || product.short_description || "",
    description_en: product.short_description || product.long_description || "",
    hero_image: product.hero_image,
    gallery_images: images,
    size_label: variant.size_label,
    product_dimensions: variant.product_dimensions_cm,
  };
  const { error: snapshotError } = await context.admin.from("catalog_product_audit_items")
    .update({ current_snapshot: snapshot })
    .eq("id", item.id)
    .eq("job_id", job.id)
    .eq("status", "processing");
  if (snapshotError) return NextResponse.json({ ok: false, message: snapshotError.message }, { status: 500 });

  return NextResponse.json({
    ok: true,
    item: {
      id: item.id,
      productId: product.id,
      product: {
        slug: product.slug,
        nameKa: product.name_ka || product.hooma_name || "",
        nameEn: product.hooma_name || product.name_ka || "",
        descriptionKa: product.short_description_ka || product.long_description_ka || product.short_description || "",
        descriptionEn: product.short_description || product.long_description || "",
        category: categoryRow?.name_ka || categoryRow?.name_en || "Catalog",
        status: product.status,
        images,
        variant: {
          id: variant.id,
          sizeLabel: variant.size_label || "Standard",
          dimensions: variant.product_dimensions_cm ?? null,
        },
      },
      snapshot,
    },
  });
}
