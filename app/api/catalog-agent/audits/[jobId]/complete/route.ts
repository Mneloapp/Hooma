import { NextResponse } from "next/server";
import { authenticateCatalogAgent, catalogAgentHasScope, catalogProductAuditJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!catalogAgentHasScope(context.agent, "audits:process")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  const { jobId } = await params;
  const job = await catalogProductAuditJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Audit job not available" }, { status: 404 });

  let body: any = {};
  try { body = await request.json(); } catch { /* Completion body is optional. */ }
  const requestedStatus = body?.status === "failed" ? "failed" : "completed";
  const { data: counters } = await context.admin.rpc("refresh_catalog_product_audit_job_counters", { requested_job_id: job.id });
  if (requestedStatus === "completed" && Number(counters?.processing_count ?? 0) > 0) {
    return NextResponse.json({ ok: false, message: "Audit job still has processing items", counters }, { status: 409 });
  }

  const processedCount = Number(counters?.processed_count ?? 0);
  const errorMessage = requestedStatus === "failed" ? clean(body?.error) || "Worker reported a failure" : null;
  await context.admin.from("catalog_product_audit_jobs").update({
    status: requestedStatus,
    total_count: requestedStatus === "completed" ? Math.min(Number(job.total_count ?? processedCount), processedCount) : job.total_count,
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  }).eq("id", job.id);
  await context.admin.from("audit_log").insert({
    actor_id: job.created_by,
    action: requestedStatus === "completed" ? "catalog_product_audit_job_completed" : "catalog_product_audit_job_failed",
    entity_type: "catalog_product_audit_job",
    entity_id: job.id,
    metadata: { catalog_agent_id: context.agent.id, counters, error: errorMessage },
  });
  return NextResponse.json({ ok: true, status: requestedStatus, counters });
}
