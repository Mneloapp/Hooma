import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";

export const CATALOG_AUDIT_WORKER_PROTOCOL = "20260722-autonomous-colors-v2";

export function supportsCatalogAuditWorkerProtocol(request: Request) {
  return request.headers.get("x-hooma-audit-protocol") === CATALOG_AUDIT_WORKER_PROTOCOL;
}

export const catalogAgentTokenPattern = /^hooma_ca_([a-f0-9]{12})_([A-Za-z0-9_-]{40,100})$/;

export function hashCatalogAgentToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function catalogAgentHasScope(agent: { scopes?: unknown }, scope: string) {
  return Array.isArray(agent.scopes) && agent.scopes.includes(scope);
}

export async function authenticateCatalogAgent(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const match = token.match(catalogAgentTokenPattern);
  if (!match) return null;

  const admin = createAdminClient() as any;
  if (!admin) throw new Error("Catalog agent database client is unavailable");
  const tokenHash = hashCatalogAgentToken(token);
  const { data: agent, error } = await admin
    .from("catalog_agents")
    .select("id,name,scopes,is_active,created_by,token_prefix")
    .eq("token_hash", tokenHash)
    .eq("token_prefix", match[1])
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Catalog agent authentication lookup failed: ${error.message}`);
  if (!agent) return null;
  return { admin, agent };
}

export async function catalogAgentJob(admin: any, agentId: string, jobId: string) {
  const { data, error } = await admin
    .from("catalog_agent_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(`Catalog agent job lookup failed: ${error.message}`);
  return data ?? null;
}

export async function catalogProductAuditJob(admin: any, agentId: string, jobId: string) {
  const { data, error } = await admin
    .from("catalog_product_audit_jobs")
    .select("*")
    .eq("id", jobId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (error) throw new Error(`Catalog product audit job lookup failed: ${error.message}`);
  return data ?? null;
}
