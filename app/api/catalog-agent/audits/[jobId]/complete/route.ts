import { NextResponse } from "next/server";
import {
  authenticateCatalogAgent,
  catalogAgentHasScope,
  catalogProductAuditJob,
  supportsCatalogAuditWorkerProtocol,
} from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: Promise<{ jobId: string }> }) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!catalogAgentHasScope(context.agent, "audits:process")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (!supportsCatalogAuditWorkerProtocol(request)) {
    return NextResponse.json({
      ok: false,
      message: "Catalog audit worker update required before changing job status",
    }, { status: 426 });
  }
  const { jobId } = await params;
  const job = await catalogProductAuditJob(context.admin, context.agent.id, jobId);
  if (!job) return NextResponse.json({ ok: false, message: "Audit job not available" }, { status: 404 });
  if (job.status !== "running") {
    return NextResponse.json({ ok: true, status: job.status, counters: null, idempotent: true });
  }

  let body: any = {};
  try { body = await request.json(); } catch { /* Completion body is optional. */ }
  const requestedStatus = body?.status === "failed" ? "failed" : "completed";
  const { data: result, error } = await context.admin.rpc("complete_catalog_product_audit_job_v1", {
    requested_agent_id: context.agent.id,
    requested_job_id: job.id,
    requested_status: requestedStatus,
    requested_error_message: requestedStatus === "failed" ? String(body?.error ?? "") : null,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  if (!result || typeof result !== "object" || typeof result.status !== "string") {
    return NextResponse.json({ ok: false, message: "Audit job completion returned an invalid response" }, { status: 500 });
  }
  if (result.blocked === true) {
    return NextResponse.json({
      ok: false,
      message: "Audit job still has processing items",
      counters: result.counters ?? null,
    }, { status: 409 });
  }
  return NextResponse.json({
    ok: true,
    status: result.status,
    counters: result.counters ?? null,
    idempotent: result.idempotent === true,
  });
}
