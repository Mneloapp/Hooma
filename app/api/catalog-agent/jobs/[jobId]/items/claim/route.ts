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

  const { data, error } = await context.admin.rpc("claim_catalog_agent_item", {
    requested_agent_id: context.agent.id,
    requested_job_id: job.id,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, item: data ?? null });
}

