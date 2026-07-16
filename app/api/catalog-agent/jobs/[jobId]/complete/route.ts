import { NextResponse } from "next/server";
import { authenticateCatalogAgent, catalogAgentJob } from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const clean = (value: unknown, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  const { jobId } = await params;
  const job = await catalogAgentJob(context.admin, context.agent.id, jobId);
  if (!job || job.status !== "running") return NextResponse.json({ ok: false, message: "Job not available" }, { status: 404 });

  let body: any = {};
  try { body = await request.json(); } catch { /* Completion body is optional. */ }
  const requestedStatus = body?.status === "failed" ? "failed" : "completed";
  const { data: counters } = await context.admin.rpc("refresh_catalog_agent_job_counters", { requested_job_id: job.id });
  if (requestedStatus === "completed" && Number(counters?.pending_count ?? 0) > 0) {
    return NextResponse.json({ ok: false, message: "Job still has pending items", counters }, { status: 409 });
  }

  const errorMessage = requestedStatus === "failed" ? clean(body?.error, 500) || "Worker reported a failure" : null;
  await context.admin.from("catalog_agent_jobs").update({
    status: requestedStatus,
    error_message: errorMessage,
    completed_at: new Date().toISOString(),
    heartbeat_at: new Date().toISOString(),
  }).eq("id", job.id);
  await context.admin.from("audit_log").insert({
    actor_id: job.created_by,
    action: requestedStatus === "completed" ? "catalog_agent_job_completed" : "catalog_agent_job_failed",
    entity_type: "catalog_agent_job",
    entity_id: job.id,
    metadata: { catalog_agent_id: context.agent.id, counters, error: errorMessage },
  });
  return NextResponse.json({ ok: true, status: requestedStatus, counters });
}

