import { redirect } from "next/navigation";
import { CatalogProductAuditConsole } from "@/components/admin/CatalogProductAuditConsole";
import { buildCategoryOptions, type CategoryOption, type CategoryRow } from "@/lib/catalog-categories";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

const JOB_HISTORY_PAGE_SIZE = 25;
const REVIEW_PAGE_SIZE = 12;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const jobSelect = "id,agent_id,status,product_statuses,category_id,category_scope_ids,category_label,total_count,processed_count,ready_count,applied_count,rejected_count,skipped_count,failed_count,worker_name,error_message,snapshot_at,claimed_at,heartbeat_at,completed_at,created_at,updated_at";
const reviewSelect = `
  id,job_id,product_id,status,current_snapshot,suggestion,confidence,warnings,model_name,error_message,processed_at,updated_at,
  catalog_product_audit_jobs!inner(id,category_id,category_label,created_at),
  products!inner(
    id,slug,category_id,
    categories(id,parent_id,slug,name_en,name_ka),
    product_sources(source_url),
    product_variants(id,is_active,available_colors,attributes)
  )
`;

type AuditAgentSearchParams = {
  history_category?: string;
  history_status?: string;
  history_page?: string;
  review_category?: string;
  review_status?: string;
  review_job?: string;
  review_page?: string;
};

function boundedPage(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "1", 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 20_000) : 1;
}

function categoryScopeIds(categoryId: string, categories: CategoryOption[]) {
  const selected = categories.find((category) => category.id === categoryId);
  if (!selected) return [];
  if (selected.parentSlug) return [selected.id];
  return [selected.id, ...categories.filter((category) => category.parentSlug === selected.slug).map((category) => category.id)];
}

function singleRelation<T>(value: T | T[] | null | undefined): T | null {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function AuditAgentPage({
  searchParams,
}: {
  searchParams: Promise<AuditAgentSearchParams>;
}) {
  const actor = await requirePermission("catalog.manage");
  if (!actor) redirect("/login?next=/admin/audit-agent");
  const params = await searchParams;
  const admin = createAdminClient() as any;

  const [agentResult, categoryResult, schemaResult, activeJobResult, reviewableJobResult] = admin ? await Promise.all([
    admin.from("catalog_agents").select("id,name,token_prefix,is_active,last_seen_at,created_at").order("created_at", { ascending: false }),
    admin.from("categories").select("id,parent_id,slug,name_en,name_ka,sort_order").eq("is_active", true).order("sort_order"),
    admin.from("products").select("catalog_audit_attempted_at,catalog_audit_applied_at").limit(1),
    admin.from("catalog_product_audit_jobs").select("id").in("status", ["queued", "running"]).limit(1),
    admin.from("catalog_product_audit_jobs").select(jobSelect).gt("ready_count", 0).order("created_at", { ascending: false }).limit(100),
  ]) : [
    { data: [], error: new Error("Supabase is not configured") },
    { data: [], error: new Error("Supabase is not configured") },
    { data: [], error: new Error("Supabase is not configured") },
    { data: [], error: new Error("Supabase is not configured") },
    { data: [], error: new Error("Supabase is not configured") },
  ];

  const categories = buildCategoryOptions((categoryResult.data ?? []) as CategoryRow[]);
  const categoryIds = new Set(categories.map((category) => category.id));
  const historyCategory = categoryIds.has(params.history_category ?? "") ? params.history_category! : "all";
  const historyStatus = ["queued", "running", "completed", "failed", "cancelled"].includes(params.history_status ?? "")
    ? params.history_status!
    : "all";
  const historyPage = boundedPage(params.history_page);
  const reviewCategory = categoryIds.has(params.review_category ?? "") ? params.review_category! : "all";
  const reviewStatus = ["ready", "failed", "all"].includes(params.review_status ?? "") ? params.review_status! : "ready";
  const reviewJob = uuidPattern.test(params.review_job ?? "") ? params.review_job! : "";
  const reviewPage = boundedPage(params.review_page);

  let historyQuery = admin?.from("catalog_product_audit_jobs")
    .select(jobSelect)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (historyStatus !== "all") historyQuery = historyQuery?.eq("status", historyStatus);
  const historyScope = historyCategory === "all" ? [] : categoryScopeIds(historyCategory, categories);
  if (historyScope.length) historyQuery = historyQuery?.in("category_id", historyScope);
  const historyOffset = (historyPage - 1) * JOB_HISTORY_PAGE_SIZE;
  historyQuery = historyQuery?.range(historyOffset, historyOffset + JOB_HISTORY_PAGE_SIZE);

  let reviewQuery = admin?.from("catalog_product_audit_items")
    .select(reviewSelect)
    .eq("review_visible", true)
    .order("updated_at", { ascending: false })
    .order("id", { ascending: false });
  reviewQuery = reviewStatus === "all"
    ? reviewQuery?.in("status", ["ready", "failed"])
    : reviewQuery?.eq("status", reviewStatus);
  if (reviewJob) reviewQuery = reviewQuery?.eq("job_id", reviewJob);
  const reviewScope = reviewCategory === "all" ? [] : categoryScopeIds(reviewCategory, categories);
  if (reviewScope.length) reviewQuery = reviewQuery?.in("products.category_id", reviewScope);
  const reviewOffset = (reviewPage - 1) * REVIEW_PAGE_SIZE;
  reviewQuery = reviewQuery?.range(reviewOffset, reviewOffset + REVIEW_PAGE_SIZE);

  const [historyResult, reviewResult] = admin ? await Promise.all([
    historyQuery,
    reviewQuery,
  ]) : [
    { data: [], error: new Error("Supabase is not configured") },
    { data: [], error: new Error("Supabase is not configured") },
  ];

  const rawHistoryJobs = (historyResult.data ?? []) as any[];
  const historyHasNextPage = rawHistoryJobs.length > JOB_HISTORY_PAGE_SIZE;
  const jobs = rawHistoryJobs.slice(0, JOB_HISTORY_PAGE_SIZE);
  const rawItems = (reviewResult.data ?? []) as any[];
  const reviewHasNextPage = rawItems.length > REVIEW_PAGE_SIZE;
  const categoryNames = new Map(categories.map((category) => [category.id, category.name]));
  const items = rawItems.slice(0, REVIEW_PAGE_SIZE).map((item) => {
    const product: any = singleRelation(item.products);
    const auditJob: any = singleRelation(item.catalog_product_audit_jobs);
    const category: any = singleRelation(product?.categories);
    const variants = Array.isArray(product?.product_variants) ? product.product_variants : [];
    const variant = variants.find((candidate: any) => candidate.id === item.current_snapshot?.variant_id)
      ?? variants.find((candidate: any) => candidate.is_active)
      ?? variants[0];
    const attributes = variant?.attributes && typeof variant.attributes === "object" && !Array.isArray(variant.attributes) ? variant.attributes : {};
    const fixedPalette = Array.isArray(attributes.fixed_color_palette) ? attributes.fixed_color_palette.filter((color: unknown): color is string => typeof color === "string") : [];
    const availableColors = Array.isArray(variant?.available_colors) ? variant.available_colors.filter((color: unknown): color is string => typeof color === "string") : [];
    const fixedMulticolor = attributes.ams_required === true && attributes.color_mode === "fixed_multicolor";
    const sources = Array.isArray(product?.product_sources) ? product.product_sources : [];
    const sourceUrl = sources.find((source: any) => typeof source?.source_url === "string" && /^https:\/\//i.test(source.source_url))?.source_url ?? null;
    return {
      ...item,
      products: undefined,
      catalog_product_audit_jobs: undefined,
      product_slug: product?.slug ?? null,
      source_url: sourceUrl,
      category_id: product?.category_id ?? null,
      category_label: categoryNames.get(product?.category_id) ?? category?.name_ka ?? category?.name_en ?? "კატეგორია უცნობია",
      job_category_label: auditJob?.category_label ?? "ძველი საერთო აუდიტი",
      job_created_at: auditJob?.created_at ?? null,
      color_mode: fixedMulticolor ? "fixed_multicolor" : "customer_choice",
      available_colors: fixedMulticolor ? fixedPalette : availableColors,
    };
  });

  return (
    <div className="min-w-0 max-w-full space-y-6 overflow-x-hidden">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Manager-reviewed catalog copy</p><h1 className="mt-3 text-4xl font-medium">Audit Agent</h1><p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">AI თითო პროდუქტზე იყენებს მხოლოდ ერთ მთავარ ფოტოს, ასწორებს ქართულ/ინგლისურ სახელსა და აღწერას და აფასებს მიახლოებით ზომას. ფოტოები, ფერები და AMS უცვლელად რჩება; საბოლოო ცვლილებას ყოველთვის მენეჯერი ამოწმებს და ამტკიცებს.</p></div>
      <CatalogProductAuditConsole
        agents={(agentResult.data ?? []) as any}
        jobs={jobs as any}
        reviewableJobs={(reviewableJobResult.data ?? []) as any}
        items={items as any}
        categories={categories}
        migrationReady={!categoryResult.error && !schemaResult.error}
        hasActiveJobs={(activeJobResult.data?.length ?? 0) > 0}
        historyLoadError={historyResult.error?.message ?? null}
        reviewLoadError={reviewResult.error?.message ?? null}
        historyFilters={{ category: historyCategory, status: historyStatus, page: historyPage, hasNextPage: historyHasNextPage }}
        reviewFilters={{ category: reviewCategory, status: reviewStatus, job: reviewJob, page: reviewPage, hasNextPage: reviewHasNextPage }}
      />
    </div>
  );
}
