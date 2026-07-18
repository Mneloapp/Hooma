import { NextResponse } from "next/server";
import { authenticateCatalogAgent, catalogAgentJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const job = await catalogAgentJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Job not available" }, { status: 404 });

  for (let skipped = 0; skipped < 100; skipped += 1) {
    const { data, error } = await context.admin.rpc("claim_catalog_agent_item", {
      requested_agent_id: context.agent.id,
      requested_job_id: job.id,
    });
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ ok: true, item: null, skippedDuplicates: skipped });

    const sourceModelId = typeof data.source_model_id === "string" && data.source_model_id.trim() ? data.source_model_id.trim() : null;
    const [{ data: priorImportByUrl }, { data: priorSourceByUrl }, priorImportByModelResult, priorSourceByModelResult] = await Promise.all([
      context.admin.from("source_imports").select("id,product_id").eq("platform", job.source_platform).eq("source_url", data.source_url).maybeSingle(),
      context.admin.from("product_sources").select("product_id").eq("platform", job.source_platform).eq("source_url", data.source_url).maybeSingle(),
      sourceModelId
        ? context.admin.from("source_imports").select("id,product_id").eq("platform", job.source_platform).eq("source_model_id", sourceModelId).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
      sourceModelId
        ? context.admin.from("product_sources").select("product_id").eq("platform", job.source_platform).eq("source_model_id", sourceModelId).limit(1).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const priorImport = priorImportByUrl ?? priorImportByModelResult.data;
    const priorSource = priorSourceByUrl ?? priorSourceByModelResult.data;
    if (!priorImport && !priorSource) {
      return NextResponse.json({ ok: true, item: data, skippedDuplicates: skipped });
    }

    await context.admin.from("catalog_agent_items").update({
      status: "duplicate",
      source_import_id: priorImport?.id ?? null,
      product_id: priorImport?.product_id ?? priorSource?.product_id ?? null,
      error_message: null,
      processed_at: new Date().toISOString(),
    }).eq("id", data.id).eq("job_id", job.id);
    await context.admin.rpc("refresh_catalog_agent_job_counters", { requested_job_id: job.id });
  }
  return NextResponse.json({
    ok: true,
    item: null,
    skippedDuplicates: 100,
    continueClaiming: true,
  });
}
