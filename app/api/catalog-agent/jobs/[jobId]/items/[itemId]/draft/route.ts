import { NextResponse } from "next/server";
import { productColorNames } from "@/data/product-colors";
import { asClipperPayload, normalizeCatalogUrl, safeAgentSlug, sourceModelId } from "@/lib/catalog-agent";
import { authenticateCatalogAgent, catalogAgentJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown, max = 3_000) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const allowedColors = new Set<string>(productColorNames);

function finitePositive(value: unknown, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= maximum ? parsed : null;
}

function safeMediaUrls(values: unknown) {
  if (!Array.isArray(values)) return [];
  const result: string[] = [];
  for (const value of values) {
    try {
      const url = new URL(String(value));
      if (url.protocol === "https:" && !url.username && !url.password && !result.includes(url.toString())) result.push(url.toString());
    } catch { /* Ignore malformed media URLs. */ }
  }
  return result.slice(0, 12);
}

function materialCodeHint(value: unknown) {
  const upper = clean(value, 100).toUpperCase();
  if (upper.includes("PETG")) return "PETG";
  if (upper.includes("ASA")) return "ASA";
  if (upper.includes("TPU") || upper.includes("TPE")) return "TPU";
  if (upper.includes("PLA")) return "PLA";
  if (upper.includes("ABS")) return "ABS";
  if (upper.includes("PA") || upper.includes("NYLON")) return "PA";
  if (upper.includes("PC")) return "PC";
  return upper;
}

async function updateCounters(admin: any, jobId: string) {
  await admin.rpc("refresh_catalog_agent_job_counters", { requested_job_id: jobId });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string; itemId: string }> },
) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const { jobId, itemId } = await params;
  const job = await catalogAgentJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Job not available" }, { status: 404 });

  const { data: item } = await context.admin.from("catalog_agent_items").select("*")
    .eq("id", itemId).eq("job_id", job.id).maybeSingle();
  if (!item) return NextResponse.json({ ok: false, message: "Item not found" }, { status: 404 });
  if (["draft_created", "duplicate"].includes(item.status)) {
    return NextResponse.json({ ok: true, status: item.status, productId: item.product_id ?? null, idempotent: true });
  }

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 }); }
  if (body?.error) {
    const message = clean(body.error, 500) || "Product extraction failed";
    await context.admin.from("catalog_agent_items").update({
      status: "failed", error_message: message, processed_at: new Date().toISOString(),
    }).eq("id", item.id);
    await updateCounters(context.admin, job.id);
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const payload = asClipperPayload(body?.payload ?? body);
  if (!payload) return NextResponse.json({ ok: false, message: "Invalid Clipper payload" }, { status: 400 });

  let normalizedSource: URL;
  try { normalizedSource = normalizeCatalogUrl(payload.source.url, new URL(job.source_url).hostname.toLowerCase()); }
  catch { return NextResponse.json({ ok: false, message: "Payload source does not belong to this job" }, { status: 400 }); }
  if (normalizedSource.toString() !== item.source_url) {
    return NextResponse.json({ ok: false, message: "Payload source does not match claimed item" }, { status: 409 });
  }

  const name = clean(payload.product.name, 160);
  const description = clean(payload.product.description, 3_000);
  const images = safeMediaUrls(payload.product.media.imageUrls);
  const videoUrl = safeMediaUrls(payload.product.media.videoUrl ? [payload.product.media.videoUrl] : [])[0] ?? null;
  const materialHint = materialCodeHint(payload.product.technical.material);
  const grams = finitePositive(payload.product.technical.weightGrams, 1_000_000);
  const minutesRaw = finitePositive(payload.product.technical.printTimeMinutes, 1_000_000);
  const minutes = minutesRaw ? Math.round(minutesRaw) : null;
  const warnings = Array.isArray(payload.warnings) ? payload.warnings.map((warning) => clean(warning, 300)).filter(Boolean).slice(0, 30) : [];
  const missing = [
    !name ? "name" : null,
    description.length < 10 ? "description" : null,
    !images.length ? "images" : null,
    !materialHint ? "material" : null,
    !grams ? "weight" : null,
    !minutes ? "print_time" : null,
  ].filter(Boolean);

  const sourceId = clean(item.source_model_id, 160) || sourceModelId(normalizedSource);
  const extractedMetadata = {
    title: name || item.source_title || null,
    description,
    images,
    video_url: videoUrl,
    canonical_url: normalizedSource.toString(),
    model_id: sourceId,
    category_path: Array.isArray(payload.product.categoryPath) ? payload.product.categoryPath.slice(0, 8) : [],
    technical: payload.product.technical,
    operator_reference: clean(payload.product.operatorReference, 2_000) || normalizedSource.toString(),
    reuse: { status: "requires_review", commercial_use_allowed: false, media_use_allowed: false },
    extraction: { source: "hooma_catalog_agent_v1", extracted_at: new Date().toISOString(), agent_id: context.agent.id },
    warnings,
  };

  const [{ data: existingImport }, { data: existingSource }] = await Promise.all([
    context.admin.from("source_imports").select("id,product_id,status")
      .eq("platform", job.source_platform).eq("source_url", normalizedSource.toString()).maybeSingle(),
    context.admin.from("product_sources").select("product_id")
      .eq("platform", job.source_platform).eq("source_url", normalizedSource.toString()).maybeSingle(),
  ]);
  const existingProductId = existingImport?.product_id ?? existingSource?.product_id ?? null;
  if (existingProductId) {
    await context.admin.from("catalog_agent_items").update({
      status: "duplicate", source_import_id: existingImport?.id ?? null, product_id: existingProductId,
      extracted_payload: payload, warnings, processed_at: new Date().toISOString(), error_message: null,
    }).eq("id", item.id);
    await updateCounters(context.admin, job.id);
    return NextResponse.json({ ok: true, status: "duplicate", productId: existingProductId });
  }

  const { data: sourceImport, error: sourceError } = await context.admin.from("source_imports").upsert({
    source_url: normalizedSource.toString(),
    platform: job.source_platform,
    status: missing.length ? "needs_review" : "metadata_ready",
    source_model_id: sourceId,
    source_title: name || item.source_title || null,
    suggested_category_id: job.category_id,
    extracted_metadata: extractedMetadata,
    metadata_extracted_at: new Date().toISOString(),
    submitted_by: job.created_by,
    error_message: missing.length ? `Missing required fields: ${missing.join(", ")}` : null,
  }, { onConflict: "platform,source_url" }).select("id,product_id").single();
  if (sourceError || !sourceImport) return NextResponse.json({ ok: false, message: sourceError?.message ?? "Source import failed" }, { status: 500 });

  if (missing.length) {
    await context.admin.from("catalog_agent_items").update({
      status: "needs_review", source_import_id: sourceImport.id, extracted_payload: payload, warnings,
      error_message: `Missing required fields: ${missing.join(", ")}`, processed_at: new Date().toISOString(),
    }).eq("id", item.id);
    await updateCounters(context.admin, job.id);
    return NextResponse.json({ ok: true, status: "needs_review", sourceImportId: sourceImport.id, missing });
  }

  const [{ data: materials }, { data: pricing }] = await Promise.all([
    context.admin.from("material_cost_profiles").select("id,code,name").eq("is_active", true).order("code"),
    context.admin.from("pricing_profiles").select("id,default_margin_percent").eq("is_default", true).maybeSingle(),
  ]);
  const normalizedMaterialHint = materialHint.replace(/[^A-Z0-9]/g, "");
  const material = (materials ?? []).find((candidate: any) => {
    const code = String(candidate.code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    const label = String(candidate.name ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    return code === normalizedMaterialHint || code.startsWith(normalizedMaterialHint) || normalizedMaterialHint.startsWith(code) || label.includes(normalizedMaterialHint);
  });
  if (!material || !pricing) {
    const reason = !material ? `Material profile not found: ${materialHint}` : "Default pricing profile not found";
    await context.admin.from("source_imports").update({ status: "needs_review", error_message: reason }).eq("id", sourceImport.id);
    await context.admin.from("catalog_agent_items").update({
      status: "needs_review", source_import_id: sourceImport.id, extracted_payload: payload, warnings,
      error_message: reason, processed_at: new Date().toISOString(),
    }).eq("id", item.id);
    await updateCounters(context.admin, job.id);
    return NextResponse.json({ ok: true, status: "needs_review", sourceImportId: sourceImport.id, missing: [reason] });
  }

  const rawColors = Array.isArray(payload.product.technical.colors) ? payload.product.technical.colors : [];
  const selectedColors = Array.from(new Set(rawColors.map((color) => clean(color, 60)).filter((color) => allowedColors.has(color))));
  if (!selectedColors.length) selectedColors.push("თეთრი");
  const requestedColorMode = payload.product.technical.colorMode === "fixed_multicolor" ? "fixed_multicolor" : "customer_choice";
  const colorMode = requestedColorMode === "fixed_multicolor" && selectedColors.length >= 2 ? "fixed_multicolor" : "customer_choice";
  const marginValue = Number(payload.product.technical.marginPercent);
  const margin = Number.isFinite(marginValue) && marginValue >= 0 && marginValue < 100
    ? marginValue
    : Number(pricing.default_margin_percent);
  const slug = safeAgentSlug(name, sourceId);

  const { data: productId, error: draftError } = await context.admin.rpc("create_product_draft_from_import", {
    import_uuid: sourceImport.id,
    actor_uuid: job.created_by,
    product_name_en: name,
    product_name_ka: name,
    product_slug: slug,
    selected_category_id: job.category_id,
    selected_material_profile_id: material.id,
    selected_pricing_profile_id: pricing.id,
    selected_material_grams: grams,
    selected_print_minutes: minutes,
    selected_margin_percent: margin,
    selected_plate_count: 1,
    selected_dimensions: null,
    selected_license_name: null,
    selected_license_url: null,
    confirmed_commercial_use: false,
    confirmed_media_use: false,
  });
  if (draftError || !productId) {
    const reason = clean(draftError?.message ?? "Product Draft could not be created", 500);
    await context.admin.from("source_imports").update({ status: "needs_review", error_message: reason }).eq("id", sourceImport.id);
    await context.admin.from("catalog_agent_items").update({
      status: "needs_review", source_import_id: sourceImport.id, extracted_payload: payload, warnings,
      error_message: reason, processed_at: new Date().toISOString(),
    }).eq("id", item.id);
    await updateCounters(context.admin, job.id);
    return NextResponse.json({ ok: true, status: "needs_review", sourceImportId: sourceImport.id, missing: [reason] });
  }

  const customerColors = colorMode === "fixed_multicolor" ? ["მრავალფერიანი — როგორც ფოტოზე"] : selectedColors;
  await Promise.all([
    context.admin.from("products").update({ video_url: videoUrl }).eq("id", productId),
    context.admin.from("product_variants").update({
      available_colors: customerColors,
      attributes: {
        source_import_id: sourceImport.id,
        color_mode: colorMode,
        ams_required: colorMode === "fixed_multicolor",
        fixed_color_palette: colorMode === "fixed_multicolor" ? selectedColors : [],
        catalog_agent_id: context.agent.id,
      },
    }).eq("product_id", productId),
    context.admin.from("product_operator_references").upsert({
      product_id: productId,
      reference: clean(payload.product.operatorReference, 2_000) || normalizedSource.toString(),
      created_by: job.created_by,
    }, { onConflict: "product_id" }),
  ]);
  await context.admin.from("catalog_agent_items").update({
    status: "draft_created", source_import_id: sourceImport.id, product_id: productId,
    extracted_payload: payload, warnings, error_message: null, processed_at: new Date().toISOString(),
  }).eq("id", item.id);
  await context.admin.from("audit_log").insert({
    actor_id: job.created_by,
    action: "catalog_agent_product_draft_created",
    entity_type: "product",
    entity_id: productId,
    metadata: { catalog_agent_id: context.agent.id, job_id: job.id, item_id: item.id, source_url: normalizedSource.toString() },
  });
  await updateCounters(context.admin, job.id);
  return NextResponse.json({ ok: true, status: "draft_created", productId, skuSource: slug });
}
