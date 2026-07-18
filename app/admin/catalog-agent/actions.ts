"use server";

import { createHash, randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { catalogPlatform, normalizeCatalogUrl } from "@/lib/catalog-agent";

export type CatalogAgentActionState = { ok?: boolean; message?: string; token?: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: unknown, max = 500) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

function issueCatalogAgentToken() {
  const prefix = randomBytes(6).toString("hex");
  const secret = randomBytes(36).toString("base64url");
  const token = `hooma_ca_${prefix}_${secret}`;
  return {
    prefix,
    token,
    tokenHash: createHash("sha256").update(token, "utf8").digest("hex"),
  };
}

export async function createCatalogAgentAction(
  _state: CatalogAgentActionState,
  formData: FormData,
): Promise<CatalogAgentActionState> {
  const actor = await requirePermission("team.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return { message: "Catalog Agent-ის რეგისტრაცია მხოლოდ Owner-ს შეუძლია." };

  const name = clean(formData.get("name"), 120);
  if (name.length < 2) return { message: "მიუთითე აგენტის სახელი." };

  const { prefix, token, tokenHash } = issueCatalogAgentToken();
  const { data, error } = await admin.from("catalog_agents").insert({
    name,
    token_prefix: prefix,
    token_hash: tokenHash,
    scopes: ["jobs:claim", "drafts:create"],
    created_by: actor.id,
  }).select("id").single();
  if (error || !data) return { message: error?.message ?? "Catalog Agent ვერ დარეგისტრირდა." };

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "catalog_agent_registered",
    entity_type: "catalog_agent",
    entity_id: data.id,
    metadata: { name, token_prefix: prefix, scopes: ["jobs:claim", "drafts:create"] },
  });
  revalidatePath("/admin/catalog-agent");
  return {
    ok: true,
    token,
    message: "აგენტი დარეგისტრირდა. Token მხოლოდ ახლა ჩანს — შეინახე Hooma Clipper-ში ან Windows worker-ის .env ფაილში.",
  };
}

export async function rotateCatalogAgentTokenAction(
  _state: CatalogAgentActionState,
  formData: FormData,
): Promise<CatalogAgentActionState> {
  const actor = await requirePermission("team.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return { message: "Catalog Agent-ის token-ის განახლება მხოლოდ Owner-ს შეუძლია." };

  const agentId = clean(formData.get("agent_id"), 36);
  if (!uuidPattern.test(agentId)) return { message: "Agent-ის ID არასწორია." };

  const { data: agent } = await admin.from("catalog_agents")
    .select("id,name,token_prefix,is_active")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return { message: "Catalog Agent ვერ მოიძებნა." };

  const { prefix, token, tokenHash } = issueCatalogAgentToken();
  const { error } = await admin.from("catalog_agents").update({
    token_prefix: prefix,
    token_hash: tokenHash,
  }).eq("id", agent.id);
  if (error) return { message: error.message || "ახალი token ვერ შეიქმნა." };

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "catalog_agent_token_rotated",
    entity_type: "catalog_agent",
    entity_id: agent.id,
    metadata: {
      name: agent.name,
      previous_token_prefix: agent.token_prefix,
      token_prefix: prefix,
      agent_active: agent.is_active,
    },
  });
  revalidatePath("/admin/catalog-agent");
  return {
    ok: true,
    token,
    message: agent.is_active
      ? "ახალი token შეიქმნა და ძველი გაუქმდა. დააკოპირე ახლა — შემდეგ გვერდის განახლებაზე აღარ გამოჩნდება."
      : "ახალი token შეიქმნა, თუმცა Agent გათიშულია. დააკოპირე ახლა და შემდეგ გაააქტიურე Agent.",
  };
}

export async function createCatalogAgentJobAction(
  _state: CatalogAgentActionState,
  formData: FormData,
): Promise<CatalogAgentActionState> {
  const actor = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return { message: "კატალოგის დავალების შექმნის უფლება არ გაქვს." };

  const agentId = clean(formData.get("agent_id"), 36);
  const categoryId = clean(formData.get("category_id"), 36);
  const maxProducts = Number(formData.get("max_products"));
  if (!uuidPattern.test(agentId) || !uuidPattern.test(categoryId)) return { message: "აირჩიე აგენტი და კატეგორია." };
  if (!Number.isInteger(maxProducts) || maxProducts < 1 || maxProducts > 10_000) {
    return { message: "პროდუქტების რაოდენობა უნდა იყოს 1-დან 10 000-მდე." };
  }

  let sourceUrl: URL;
  try {
    sourceUrl = normalizeCatalogUrl(formData.get("source_url"));
  } catch {
    return { message: "შეიყვანე მხარდაჭერილი პლატფორმის HTTPS კატეგორიის ბმული." };
  }

  const [{ data: agent }, { data: category }] = await Promise.all([
    admin.from("catalog_agents").select("id").eq("id", agentId).eq("is_active", true).maybeSingle(),
    admin.from("categories").select("id,name_ka,name_en").eq("id", categoryId).eq("is_active", true).maybeSingle(),
  ]);
  if (!agent || !category) return { message: "არჩეული აგენტი ან კატეგორია აქტიური აღარ არის." };

  const { data: job, error } = await admin.from("catalog_agent_jobs").insert({
    agent_id: agentId,
    source_platform: catalogPlatform(sourceUrl),
    source_url: sourceUrl.toString(),
    category_id: categoryId,
    category_label: category.name_ka || category.name_en,
    max_products: maxProducts,
    created_by: actor.id,
  }).select("id").single();
  if (error || !job) return { message: error?.message ?? "დავალება ვერ შეიქმნა." };

  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "catalog_agent_job_created",
    entity_type: "catalog_agent_job",
    entity_id: job.id,
    metadata: { agent_id: agentId, source_url: sourceUrl.toString(), category_id: categoryId, max_products: maxProducts },
  });
  revalidatePath("/admin/catalog-agent");
  return { ok: true, message: "კატეგორიის დავალება რიგში დაემატა. Windows worker ავტომატურად აიღებს მას." };
}

export async function toggleCatalogAgentAction(formData: FormData) {
  const actor = await requirePermission("team.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return;
  const agentId = clean(formData.get("agent_id"), 36);
  const isActive = clean(formData.get("is_active"), 10) === "true";
  if (!uuidPattern.test(agentId)) return;
  await admin.from("catalog_agents").update({ is_active: isActive }).eq("id", agentId);
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: isActive ? "catalog_agent_enabled" : "catalog_agent_disabled",
    entity_type: "catalog_agent",
    entity_id: agentId,
    metadata: {},
  });
  revalidatePath("/admin/catalog-agent");
}

export async function cancelCatalogAgentJobAction(formData: FormData) {
  const actor = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!actor || !admin) return;
  const jobId = clean(formData.get("job_id"), 36);
  if (!uuidPattern.test(jobId)) return;
  await admin.from("catalog_agent_jobs").update({ status: "cancelled", completed_at: new Date().toISOString() })
    .eq("id", jobId).in("status", ["queued", "running", "paused"]);
  await admin.from("audit_log").insert({
    actor_id: actor.id,
    action: "catalog_agent_job_cancelled",
    entity_type: "catalog_agent_job",
    entity_id: jobId,
    metadata: {},
  });
  revalidatePath("/admin/catalog-agent");
}
