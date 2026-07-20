import { NextResponse } from "next/server";
import { asCatalogProductAuditAnalysis } from "@/lib/catalog-agent";
import { authenticateCatalogAgent, catalogAgentHasScope, catalogProductAuditJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ jobId: string; itemId: string }> },
) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!catalogAgentHasScope(context.agent, "audits:process")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const { jobId, itemId } = await params;
  const job = await catalogProductAuditJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Audit job not available" }, { status: 404 });

  const { data: item } = await context.admin.from("catalog_product_audit_items")
    .select("id,product_id,status,current_snapshot")
    .eq("id", itemId)
    .eq("job_id", job.id)
    .maybeSingle();
  if (!item) return NextResponse.json({ ok: false, message: "Audit item not found" }, { status: 404 });
  if (["ready", "applied", "rejected", "skipped"].includes(item.status)) {
    return NextResponse.json({ ok: true, status: item.status, idempotent: true });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 }); }
  if (body?.error) {
    const message = clean(body.error) || "Product audit failed";
    await context.admin.from("catalog_product_audit_items").update({
      status: "failed",
      error_message: message,
      processed_at: new Date().toISOString(),
    }).eq("id", item.id);
    await context.admin.rpc("refresh_catalog_product_audit_job_counters", { requested_job_id: job.id });
    return NextResponse.json({ ok: true, status: "failed" });
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
    || decisionUrls.length !== snapshotImages.length
    || decisionUrls.some((url) => !imageSet.has(url))
    || snapshotImages.some((url: string) => !decisionUrls.includes(url))
  ) {
    return NextResponse.json({ ok: false, message: "Image decisions do not match the claimed product" }, { status: 409 });
  }
  const keptImages = analysis.imageDecisions.filter((decision) => decision.keep).map((decision) => decision.url);
  const removedImages = analysis.imageDecisions.filter((decision) => !decision.keep).map((decision) => decision.url);
  if (!keptImages.length || !keptImages.includes(analysis.heroImageUrl)) {
    return NextResponse.json({ ok: false, message: "At least one kept hero image is required" }, { status: 400 });
  }

  const suggestion = {
    description_ka: analysis.descriptionKa,
    description_en: analysis.descriptionEn,
    dimensions_mm: analysis.dimensionsMm,
    dimension_confidence: analysis.dimensionConfidence,
    kept_image_urls: keptImages,
    removed_image_urls: removedImages,
    image_decisions: analysis.imageDecisions,
    hero_image_url: analysis.heroImageUrl,
    summary: analysis.summary,
  };
  const { error } = await context.admin.from("catalog_product_audit_items").update({
    status: "ready",
    current_snapshot: snapshot,
    suggestion,
    confidence: analysis.dimensionConfidence,
    warnings: analysis.warnings,
    model_name: analysis.model,
    provider_response_id: analysis.responseId,
    processing_ms: analysis.processingMs === null ? null : Math.round(analysis.processingMs ?? 0),
    error_message: null,
    processed_at: new Date().toISOString(),
  }).eq("id", item.id).eq("status", "processing");
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  await context.admin.rpc("refresh_catalog_product_audit_job_counters", { requested_job_id: job.id });
  return NextResponse.json({ ok: true, status: "ready", productId: item.product_id });
}
