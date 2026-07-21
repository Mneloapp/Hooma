import { NextResponse } from "next/server";
import {
  authenticateCatalogAgent,
  catalogAgentHasScope,
  catalogProductAuditJob,
  supportsCatalogAuditWorkerProtocol,
} from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

let auditSchemaReady = false;

const safeImages = (hero: unknown, gallery: unknown) => Array.from(new Set<string>([
  ...(typeof hero === "string" && hero.startsWith("https://") ? [hero] : []),
  ...(Array.isArray(gallery) ? gallery.filter((url): url is string => typeof url === "string" && url.startsWith("https://")) : []),
])).slice(0, 12);

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!catalogAgentHasScope(context.agent, "audits:process")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (!supportsCatalogAuditWorkerProtocol(request)) {
    return NextResponse.json({
      ok: false,
      message: "Catalog audit worker update required before claiming another product",
    }, { status: 426 });
  }
  const { jobId } = await params;
  const job = await catalogProductAuditJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Audit job not available" }, { status: 404 });

  // The worker protocol and database migration must advance together. Check a
  // migration-003-only column before the first claim in each warm API process,
  // so an API-before-database rollout cannot strand an unsealed item.
  if (!auditSchemaReady) {
    const { error: schemaError } = await context.admin
      .from("products")
      .select("catalog_audit_attempted_at")
      .limit(1);
    if (schemaError) {
      return NextResponse.json({
        ok: false,
        message: "Catalog audit database migration is not ready",
      }, { status: 503 });
    }
    auditSchemaReady = true;
  }

  const { data: item, error } = await context.admin.rpc("claim_catalog_product_audit_item", {
    requested_agent_id: context.agent.id,
    requested_job_id: job.id,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!item) return NextResponse.json({ ok: true, item: null });
  if (item.status !== "processing") {
    return NextResponse.json({ ok: true, item: null, skipped: true, continueClaiming: true });
  }

  const [productResult, variantsResult, categoryResult] = await Promise.all([
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
  const finishUnsealedItem = async (message: string) => context.admin.rpc("finalize_catalog_product_audit_item_v1", {
    requested_agent_id: context.agent.id,
    requested_job_id: job.id,
    requested_item_id: item.id,
    requested_terminal_status: "skipped",
    requested_error_message: message,
  });

  if (productResult.error || variantsResult.error || categoryResult.error) {
    const queryError = productResult.error ?? variantsResult.error ?? categoryResult.error;
    const { error: terminalError } = await finishUnsealedItem("Catalog data could not be read while preparing the audit");
    return NextResponse.json({
      ok: false,
      message: terminalError?.message ?? queryError?.message ?? "Catalog data could not be read",
    }, { status: 500 });
  }

  const product = productResult.data;
  const variants = variantsResult.data;
  const category = categoryResult.data;
  const variant = variants?.[0] ?? null;
  if (!product || !variant) {
    const { data: terminal, error: terminalError } = await finishUnsealedItem("Product or active variant is missing");
    if (terminalError) return NextResponse.json({ ok: false, message: terminalError.message }, { status: 500 });
    if (terminal?.status === "processing") {
      return NextResponse.json({ ok: false, message: "Catalog audit attempt was already sealed" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, item: null, skipped: true, continueClaiming: true });
  }

  const images = safeImages(product.hero_image, product.gallery_images);
  if (!images.length) {
    const { data: terminal, error: terminalError } = await finishUnsealedItem("Product has no auditable HTTPS images");
    if (terminalError) return NextResponse.json({ ok: false, message: terminalError.message }, { status: 500 });
    if (terminal?.status === "processing") {
      return NextResponse.json({ ok: false, message: "Catalog audit attempt was already sealed" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, item: null, skipped: true, continueClaiming: true });
  }

  const categoryRow = Array.isArray(category?.categories) ? category.categories[0] : category?.categories;
  const snapshot = {
    product_updated_at: product.updated_at,
    variant_id: variant.id,
    variant_updated_at: variant.updated_at,
    name_ka: product.name_ka || product.hooma_name || "",
    name_en: product.hooma_name || product.name_ka || "",
    description_ka: product.short_description_ka || product.long_description_ka || product.short_description || "",
    description_en: product.short_description || product.long_description || "",
    hero_image: product.hero_image,
    gallery_images: images,
    size_label: variant.size_label,
    product_dimensions: variant.product_dimensions_cm,
  };
  const { data: attempt, error: attemptError } = await context.admin.rpc("begin_catalog_product_audit_attempt_v1", {
    requested_agent_id: context.agent.id,
    requested_job_id: job.id,
    requested_item_id: item.id,
    requested_snapshot: snapshot,
  });
  if (attemptError) return NextResponse.json({ ok: false, message: attemptError.message }, { status: 500 });
  if (
    !attempt
    || attempt.status !== "processing"
    || attempt.sealed !== true
    || attempt.idempotent !== false
  ) {
    return NextResponse.json({ ok: true, item: null, skipped: true, continueClaiming: true });
  }
  const sealedSnapshot = attempt.current_snapshot;
  if (!sealedSnapshot || typeof sealedSnapshot !== "object" || Array.isArray(sealedSnapshot)) {
    return NextResponse.json({ ok: false, message: "Catalog audit attempt returned an invalid snapshot" }, { status: 500 });
  }

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
      snapshot: sealedSnapshot,
    },
  });
}
