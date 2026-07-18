import { NextResponse } from "next/server";
import { normalizeCatalogUrl, sourceModelId } from "@/lib/catalog-agent";
import { authenticateCatalogAgent, catalogAgentJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown, max = 300) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const job = await catalogAgentJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Job not available" }, { status: 404 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, message: "Invalid JSON" }, { status: 400 }); }
  if (!Array.isArray(body?.items) || body.items.length < 1 || body.items.length > 100) {
    return NextResponse.json({ ok: false, message: "Send between 1 and 100 discovered items" }, { status: 400 });
  }

  const sourceHost = new URL(job.source_url).hostname.toLowerCase();
  const normalized = new Map<string, { job_id: string; source_url: string; source_model_id: string | null; source_title: string | null }>();
  for (const candidate of body.items) {
    try {
      const url = normalizeCatalogUrl(candidate?.sourceUrl, sourceHost);
      const sourceUrl = url.toString();
      normalized.set(sourceUrl, {
        job_id: job.id,
        source_url: sourceUrl,
        source_model_id: clean(candidate?.sourceModelId, 160) || sourceModelId(url),
        source_title: clean(candidate?.sourceTitle, 240) || null,
      });
    } catch { /* Invalid or off-site discovery results are ignored. */ }
  }
  if (!normalized.size) return NextResponse.json({ ok: false, message: "No valid product URLs" }, { status: 400 });

  const candidates = Array.from(normalized.values());
  const candidateUrls = candidates.map((item) => item.source_url);
  const candidateModelIds = Array.from(new Set(candidates.map((item) => item.source_model_id).filter((value): value is string => Boolean(value))));
  const [{ data: priorImportsByUrl }, { data: priorSourcesByUrl }, priorImportsByModelResult, priorSourcesByModelResult] = await Promise.all([
    context.admin.from("source_imports").select("source_url").eq("platform", job.source_platform).in("source_url", candidateUrls),
    context.admin.from("product_sources").select("source_url").eq("platform", job.source_platform).in("source_url", candidateUrls),
    candidateModelIds.length
      ? context.admin.from("source_imports").select("source_model_id").eq("platform", job.source_platform).in("source_model_id", candidateModelIds)
      : Promise.resolve({ data: [] }),
    candidateModelIds.length
      ? context.admin.from("product_sources").select("source_model_id").eq("platform", job.source_platform).in("source_model_id", candidateModelIds)
      : Promise.resolve({ data: [] }),
  ]);
  const globallyProcessedUrls = new Set<string>([
    ...(priorImportsByUrl ?? []).map((item: any) => String(item.source_url)),
    ...(priorSourcesByUrl ?? []).map((item: any) => String(item.source_url)),
  ]);
  const globallyProcessedModelIds = new Set<string>([
    ...(priorImportsByModelResult.data ?? []).map((item: any) => String(item.source_model_id)),
    ...(priorSourcesByModelResult.data ?? []).map((item: any) => String(item.source_model_id)),
  ]);
  const eligibleCandidates = candidates.filter((item) => (
    !globallyProcessedUrls.has(item.source_url)
    && (!item.source_model_id || !globallyProcessedModelIds.has(item.source_model_id))
  ));

  const { count: existingCount } = await context.admin
    .from("catalog_agent_items")
    .select("id", { count: "exact", head: true })
    .eq("job_id", job.id);
  const remaining = Math.max(0, Number(job.max_products) - Number(existingCount ?? 0));
  const rows = eligibleCandidates.slice(0, remaining);
  let accepted = 0;
  if (rows.length) {
    const { data: inserted, error } = await context.admin.from("catalog_agent_items")
      .upsert(rows, { onConflict: "job_id,source_url", ignoreDuplicates: true })
      .select("id");
    if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
    accepted = inserted?.length ?? 0;
  }

  const cursor = body?.cursor && typeof body.cursor === "object" ? body.cursor : {};
  await context.admin.from("catalog_agent_jobs").update({ cursor, heartbeat_at: new Date().toISOString() }).eq("id", job.id);
  const { data: counters } = await context.admin.rpc("refresh_catalog_agent_job_counters", { requested_job_id: job.id });
  return NextResponse.json({
    ok: true,
    accepted,
    skippedDuplicates: candidates.length - eligibleCandidates.length,
    alreadyInJob: rows.length - accepted,
    limitReached: rows.length < eligibleCandidates.length || remaining === 0,
    counters,
  });
}
