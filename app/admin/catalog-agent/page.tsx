import { redirect } from "next/navigation";
import { CatalogAgentConsole } from "@/components/admin/CatalogAgentConsole";
import { buildCategoryOptions, type CategoryRow } from "@/lib/catalog-categories";
import { hasPermission } from "@/lib/auth/permissions";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export default async function CatalogAgentPage() {
  const actor = await requirePermission("catalog.manage");
  if (!actor) redirect("/login?next=/admin/catalog-agent");
  const admin = createAdminClient() as any;
  const [agentResult, categoryResult, jobResult, itemResult] = admin ? await Promise.all([
    admin.from("catalog_agents").select("id,name,token_prefix,is_active,last_seen_at,created_at").order("created_at", { ascending: false }),
    admin.from("categories").select("id,parent_id,slug,name_en,name_ka,sort_order").eq("is_active", true).order("sort_order"),
    admin.from("catalog_agent_jobs").select("*").order("created_at", { ascending: false }).limit(50),
    admin.from("catalog_agent_items").select("id,job_id,source_url,source_title,status,product_id,source_import_id,error_message,processed_at").order("updated_at", { ascending: false }).limit(50),
  ]) : [{ data: [] }, { data: [] }, { data: [] }, { data: [] }];
  const categories = buildCategoryOptions((categoryResult.data ?? []) as CategoryRow[]).map(({ id, name }) => ({ id, name }));

  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog import automation</p><h1 className="mt-3 text-4xl font-medium">Catalog Agent</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">კატეგორიის წყაროდან პოულობს პროდუქტებს, იყენებს Hooma Clipper-ის extraction engine-ს და ქმნის შესამოწმებელ Draft-ებს. არსებული პროდუქტების ავტომატური გასწორება ცალკე Audit Agent გვერდზეა.</p></div>
      <CatalogAgentConsole
        agents={(agentResult.data ?? []) as any}
        categories={categories}
        jobs={(jobResult.data ?? []) as any}
        items={(itemResult.data ?? []) as any}
        canManageAgents={hasPermission(actor.role, "team.manage")}
        migrationReady={!agentResult.error && !jobResult.error && !itemResult.error}
      />
    </div>
  );
}
