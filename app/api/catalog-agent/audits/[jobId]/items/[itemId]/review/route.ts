import { NextResponse } from "next/server";
import { asCatalogProductAuditAnalysis } from "@/lib/catalog-agent";
import { authenticateCatalogAgent, catalogAgentHasScope, catalogProductAuditJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

const isMissingAuditRpc = (error: any, rpcName: string) => {
  const code = String(error?.code ?? "").toUpperCase();
  const details = [error?.message, error?.details, error?.hint].filter(Boolean).join(" ").toLowerCase();
  const missingSignal = code === "PGRST202" || code === "42883" || details.includes("schema cache");
  return missingSignal && details.includes(rpcName.toLowerCase());
};

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string; itemId: string }> },
) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!catalogAgentHasScope(context.agent, "audits:process")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const { jobId, itemId } = await params;
  const job = await catalogProductAuditJob(context.admin, context.agent.id, jobId);
  if (!job) return NextResponse.json({ ok: true, status: "gone", productId: null, idempotent: true });

  const { data: item, error: itemError } = await context.admin.from("catalog_product_audit_items")
    .select("id,product_id,status,current_snapshot")
    .eq("id", itemId)
    .eq("job_id", job.id)
    .maybeSingle();
  if (itemError) return NextResponse.json({ ok: false, message: itemError.message }, { status: 500 });
  if (!item) return NextResponse.json({ ok: true, status: "gone", productId: null, idempotent: true });
  if (["ready", "applied", "rejected", "skipped"].includes(item.status)) {
    return NextResponse.json({ ok: true, status: item.status, productId: item.product_id, idempotent: true });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 }); }
  if (body?.error) {
    const message = clean(body.error) || "Product audit failed";
    const { data: failedItem, error: failureError } = await context.admin.rpc("finalize_catalog_product_audit_item_v1", {
      requested_agent_id: context.agent.id,
      requested_job_id: job.id,
      requested_item_id: item.id,
      requested_terminal_status: "failed",
      requested_error_message: message,
    });
    if (failureError && isMissingAuditRpc(failureError, "finalize_catalog_product_audit_item_v1")) {
      // Rolling-deploy bridge: the API can be live just before migration 003 is
      // visible in PostgREST's schema cache. Preserve the already-paid worker
      // delivery with the legacy compare-and-set; migration 003 will backfill
      // its canonical attempt marker. Never use this path for other RPC errors.
      const { data: legacyItem, error: legacyError } = await context.admin
        .from("catalog_product_audit_items")
        .update({
          status: "failed",
          error_message: message,
          processed_at: new Date().toISOString(),
        })
        .eq("id", item.id)
        .eq("job_id", job.id)
        .eq("status", "processing")
        .select("id,product_id,status")
        .maybeSingle();
      if (legacyError) return NextResponse.json({ ok: false, message: legacyError.message }, { status: 500 });
      if (legacyItem) {
        const { error: refreshError } = await context.admin.rpc("refresh_catalog_product_audit_job_counters", {
          requested_job_id: job.id,
        });
        if (refreshError) return NextResponse.json({ ok: false, message: refreshError.message }, { status: 500 });
        return NextResponse.json({
          ok: true,
          status: legacyItem.status,
          productId: legacyItem.product_id,
          idempotent: false,
        });
      }
      const { data: replayedItem, error: replayError } = await context.admin
        .from("catalog_product_audit_items")
        .select("product_id,status")
        .eq("id", item.id)
        .eq("job_id", job.id)
        .maybeSingle();
      if (replayError) return NextResponse.json({ ok: false, message: replayError.message }, { status: 500 });
      if (!replayedItem) return NextResponse.json({ ok: true, status: "gone", productId: null, idempotent: true });
      if (["ready", "applied", "rejected", "skipped", "failed"].includes(replayedItem.status)) {
        return NextResponse.json({
          ok: true,
          status: replayedItem.status,
          productId: replayedItem.product_id,
          idempotent: true,
        });
      }
      return NextResponse.json({ ok: false, message: "Audit failure was not recorded" }, { status: 409 });
    }
    if (failureError) return NextResponse.json({ ok: false, message: failureError.message }, { status: 500 });
    if (!failedItem || typeof failedItem !== "object" || typeof failedItem.status !== "string") {
      return NextResponse.json({ ok: false, message: "Audit failure recorder returned an invalid response" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      status: failedItem.status,
      productId: failedItem.product_id ?? item.product_id,
      idempotent: failedItem.idempotent === true,
    });
  }

  const analysis = asCatalogProductAuditAnalysis(body?.analysis ?? body);
  const snapshot = item.current_snapshot;
  if (!analysis || !snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return NextResponse.json({ ok: false, message: "Invalid product audit payload" }, { status: 400 });
  }

  const snapshotImages = Array.isArray(snapshot.gallery_images)
    ? snapshot.gallery_images.filter((url: unknown): url is string => typeof url === "string" && url.startsWith("https://")).slice(0, 12)
    : [];
  const imageSet = new Set(snapshotImages);
  const decisionUrls = analysis.imageDecisions.map((decision) => decision.url);
  if (
    new Set(decisionUrls).size !== decisionUrls.length
    || decisionUrls.length < 1
    || decisionUrls.some((url) => !imageSet.has(url))
  ) {
    return NextResponse.json({ ok: false, message: "Image decisions do not match the claimed product" }, { status: 422 });
  }

  // The cost-bounded worker may inspect only the first configured image sample.
  // Never remove an image the model did not receive: complete the delivery with
  // conservative keep decisions for every uninspected snapshot image.
  const completedImageDecisions: Array<{ url: string; keep: boolean; reason: string }> = snapshotImages.map((url: string) => (
    analysis.imageDecisions.find((decision) => decision.url === url) ?? {
      url,
      keep: true,
      reason: "Not included in the bounded vision sample; retained for safety.",
    }
  ));
  const keptImages = completedImageDecisions.filter((decision) => decision.keep).map((decision) => decision.url);
  const removedImages = completedImageDecisions.filter((decision) => !decision.keep).map((decision) => decision.url);
  if (!keptImages.length || !keptImages.includes(analysis.heroImageUrl)) {
    return NextResponse.json({ ok: false, message: "At least one kept hero image is required" }, { status: 400 });
  }

  const suggestion = {
    name_ka: analysis.nameKa,
    name_en: analysis.nameEn,
    description_ka: analysis.descriptionKa,
    description_en: analysis.descriptionEn,
    dimensions_mm: analysis.dimensionsMm,
    dimension_confidence: analysis.dimensionConfidence,
    color_mode: analysis.colorMode,
    available_colors: analysis.colors,
    color_confidence: analysis.colorConfidence,
    color_evidence: analysis.colorEvidence,
    reference_checked: analysis.referenceChecked,
    kept_image_urls: keptImages,
    removed_image_urls: removedImages,
    image_decisions: completedImageDecisions,
    hero_image_url: analysis.heroImageUrl,
    summary: analysis.summary,
  };
  const { data: recorded, error } = await context.admin.rpc("record_catalog_product_audit_result_v1", {
    requested_agent_id: context.agent.id,
    requested_job_id: job.id,
    requested_item_id: item.id,
    requested_suggestion: suggestion,
    requested_confidence: analysis.dimensionConfidence,
    requested_warnings: analysis.warnings,
    requested_model_name: analysis.model,
    requested_provider_response_id: analysis.responseId ?? null,
    requested_processing_ms: analysis.processingMs === null ? null : Math.round(analysis.processingMs ?? 0),
  });
  if (error && isMissingAuditRpc(error, "record_catalog_product_audit_result_v1")) {
    // Delivery-only compatibility for a Vercel/Supabase rolling deploy. Claims
    // are protocol-gated; this does not authorize a new model request.
    const { data: legacyItem, error: legacyError } = await context.admin
      .from("catalog_product_audit_items")
      .update({
        status: "ready",
        current_snapshot: snapshot,
        suggestion,
        confidence: analysis.dimensionConfidence,
        warnings: analysis.warnings,
        model_name: analysis.model,
        provider_response_id: analysis.responseId ?? null,
        processing_ms: analysis.processingMs === null ? null : Math.round(analysis.processingMs ?? 0),
        error_message: null,
        processed_at: new Date().toISOString(),
      })
      .eq("id", item.id)
      .eq("job_id", job.id)
      .eq("status", "processing")
      .select("id,product_id,status")
      .maybeSingle();
    if (legacyError) return NextResponse.json({ ok: false, message: legacyError.message }, { status: 500 });
    if (legacyItem) {
      const { error: refreshError } = await context.admin.rpc("refresh_catalog_product_audit_job_counters", {
        requested_job_id: job.id,
      });
      if (refreshError) return NextResponse.json({ ok: false, message: refreshError.message }, { status: 500 });
      return NextResponse.json({
        ok: true,
        status: legacyItem.status,
        productId: legacyItem.product_id,
        idempotent: false,
      });
    }
    const { data: replayedItem, error: replayError } = await context.admin
      .from("catalog_product_audit_items")
      .select("product_id,status")
      .eq("id", item.id)
      .eq("job_id", job.id)
      .maybeSingle();
    if (replayError) return NextResponse.json({ ok: false, message: replayError.message }, { status: 500 });
    if (!replayedItem) return NextResponse.json({ ok: true, status: "gone", productId: null, idempotent: true });
    if (["ready", "applied", "rejected", "skipped", "failed"].includes(replayedItem.status)) {
      return NextResponse.json({
        ok: true,
        status: replayedItem.status,
        productId: replayedItem.product_id,
        idempotent: true,
      });
    }
    return NextResponse.json({ ok: false, message: "Audit result was not recorded" }, { status: 409 });
  }
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  const recordedStatuses = new Set(["ready", "applied", "rejected", "skipped", "failed", "gone"]);
  if (
    !recorded
    || typeof recorded !== "object"
    || !recordedStatuses.has(recorded.status)
    || (recorded.status !== "gone" && recorded.product_id !== item.product_id)
    || typeof recorded.idempotent !== "boolean"
  ) return NextResponse.json({ ok: false, message: "Audit result recorder returned an invalid response" }, { status: 500 });
  let finalStatus = recorded.status;
  let autoApplied = false;
  let autoApplyMessage: string | null = null;
  const eligibleForAutomaticApply = recorded.status === "ready"
    && analysis.warnings.length === 0
    && analysis.dimensionConfidence >= 0.75
    && analysis.colorConfidence >= 0.8;

  if (eligibleForAutomaticApply) {
    const { data: applied, error: applyError } = await context.admin.rpc("apply_catalog_product_audit_item_v4", {
      actor_profile_id: job.created_by,
      requested_item_id: item.id,
      requested_kept_image_urls: keptImages,
      requested_name_ka: analysis.nameKa,
      requested_name_en: analysis.nameEn,
      requested_description_ka: analysis.descriptionKa,
      requested_description_en: analysis.descriptionEn,
      requested_available_colors: analysis.colors,
      requested_color_mode: analysis.colorMode,
    });
    if (!applyError && applied?.product_id === item.product_id) {
      finalStatus = "applied";
      autoApplied = true;
      await context.admin.from("audit_log").insert({
        actor_id: job.created_by,
        action: "catalog_product_audit_auto_applied",
        entity_type: "product",
        entity_id: item.product_id,
        metadata: {
          audit_job_id: job.id,
          audit_item_id: item.id,
          agent_id: context.agent.id,
          dimension_confidence: analysis.dimensionConfidence,
          color_confidence: analysis.colorConfidence,
          reference_checked: analysis.referenceChecked,
        },
      });
    } else {
      autoApplyMessage = clean(applyError?.message || "Automatic apply returned an invalid response");
    }
  } else if (recorded.status === "ready") {
    autoApplyMessage = "Result retained for review because confidence is below the autonomous safety threshold or warnings exist";
  }

  return NextResponse.json({
    ok: true,
    status: finalStatus,
    productId: recorded.product_id ?? item.product_id,
    idempotent: recorded.idempotent,
    autoApplied,
    autoApplyMessage,
  });
}
