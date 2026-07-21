import { NextResponse } from "next/server";
import {
  authenticateCatalogAgent,
  catalogAgentHasScope,
  supportsCatalogAuditWorkerProtocol,
} from "@/lib/catalog-agent/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  const context = await authenticateCatalogAgent(request);
  if (!context) return NextResponse.json({ ok: false, message: "Unauthorized" }, { status: 401 });
  if (!catalogAgentHasScope(context.agent, "audits:process")) return NextResponse.json({ ok: false, message: "Forbidden" }, { status: 403 });
  if (!supportsCatalogAuditWorkerProtocol(request)) {
    return NextResponse.json({
      ok: false,
      message: "Catalog audit worker update required before claiming more products",
    }, { status: 426 });
  }

  let workerName = "Hooma Windows Worker";
  try {
    const body = await request.json();
    workerName = String(body?.workerName ?? workerName).replace(/\s+/g, " ").trim().slice(0, 120) || workerName;
  } catch { /* A body is optional. */ }

  const { data, error } = await context.admin.rpc("claim_catalog_product_audit_job", {
    requested_agent_id: context.agent.id,
    requested_worker_name: workerName,
  });
  if (error) return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, job: data ?? null });
}
