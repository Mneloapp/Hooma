import Link from "next/link";
import { CatalogProductTable, type CatalogProductListItem } from "@/components/admin/CatalogProductTable";
import { MoveAllProductsToDraft } from "@/components/admin/MoveAllProductsToDraft";
import { catalogCategories } from "@/data/catalog";
import { createClient, requirePermission } from "@/lib/supabase/server";

const ADMIN_PRODUCTS_PER_PAGE = 50;
const productStatuses = ["draft", "active", "archived"] as const;

export type AdminProductParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  status?: string;
  audit?: string;
  page?: string;
};

type DbCategory = { id: string; parent_id: string | null; slug: string };

function normalizedSearch(value: string | undefined) {
  return (value ?? "").trim().replace(/[^\p{L}\p{N}\s.-]/gu, " ").replace(/\s+/g, " ").slice(0, 100);
}

async function loadCatalogCounts(supabase: any) {
  const { data: aggregate, error: aggregateError } = await supabase.rpc("get_admin_catalog_counts_v1");
  if (!aggregateError && aggregate) {
    return {
      total: Number(aggregate.total ?? 0),
      draft: Number(aggregate.draft ?? 0),
      active: Number(aggregate.active ?? 0),
      archived: Number(aggregate.archived ?? 0),
      error: null,
    };
  }
  return {
    total: 0,
    draft: 0,
    active: 0,
    archived: 0,
    error: aggregateError ?? new Error("Catalog counts are unavailable"),
  };
}

export async function AdminProductCatalogPage({
  searchParams,
  approvedOnly = false,
}: {
  searchParams: Promise<AdminProductParams>;
  approvedOnly?: boolean;
}) {
  const params = await searchParams;
  const q = normalizedSearch(params.q);
  const requestedCategory = catalogCategories.find((item) => item.slug === params.category);
  const category = requestedCategory?.slug ?? "all";
  const requestedSubcategory = catalogCategories
    .flatMap((item) => item.subcategories.map((child) => ({ ...child, parentSlug: item.slug })))
    .find((item) => item.slug === params.subcategory && (category === "all" || item.parentSlug === category));
  const subcategory = requestedSubcategory?.slug ?? "all";
  const status = productStatuses.includes(params.status as typeof productStatuses[number]) ? params.status! : "all";
  const audit = approvedOnly
    ? "approved"
    : ["approved", "ready", "pending"].includes(params.audit ?? "") ? params.audit! : "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const profile = await requirePermission("catalog.manage");
  const supabase = (await createClient()) as any;

  const emptyCounts = { total: 0, draft: 0, active: 0, archived: 0, error: null };
  const safeRequestedPage = Number.isFinite(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, 20_000)
    : 1;
  const firstFrom = (safeRequestedPage - 1) * ADMIN_PRODUCTS_PER_PAGE;
  const [categoryResponse, counts, boundedResponse] = supabase
    ? await Promise.all([
      supabase.from("categories").select("id,parent_id,slug").order("sort_order", { ascending: true }),
      approvedOnly ? Promise.resolve(emptyCounts) : loadCatalogCounts(supabase),
      supabase.rpc("search_admin_catalog_products_v1", {
        requested_search: q || null,
        requested_category_slug: category === "all" ? null : category,
        requested_subcategory_slug: subcategory === "all" ? null : subcategory,
        requested_status: status === "all" ? null : status,
        requested_audit_state: audit === "all" ? null : audit,
        requested_offset: firstFrom,
        requested_limit: ADMIN_PRODUCTS_PER_PAGE,
      }),
    ])
    : [
      { data: [], error: new Error("Supabase is not configured") },
      { total: 0, draft: 0, active: 0, archived: 0, error: new Error("Supabase is not configured") },
      { data: null, error: new Error("Supabase is not configured") },
    ];

  const dbCategories = (categoryResponse.data ?? []) as DbCategory[];
  const parentCategory = dbCategories.find((item) => item.slug === category && item.parent_id === null);
  const selectedSubcategory = dbCategories.find((item) => item.slug === subcategory
    && item.parent_id !== null
    && (!parentCategory || item.parent_id === parentCategory.id));
  const categoryIds = selectedSubcategory
    ? [selectedSubcategory.id]
    : parentCategory
      ? [parentCategory.id, ...dbCategories.filter((item) => item.parent_id === parentCategory.id).map((item) => item.id)]
      : [];

  let productResponse: { data: any[]; error: any; hasMore: boolean };
  if (!boundedResponse.error && Array.isArray(boundedResponse.data?.items)) {
    productResponse = {
      data: boundedResponse.data.items,
      error: null,
      hasMore: boundedResponse.data.has_more === true,
    };
  } else {
    // Deployment-safe fallback: fetch one bounded page without an exact count.
    let productsQuery = supabase
      ?.from("products")
      .select("id,slug,hooma_name,name_ka,status,production_status,estimated_print_minutes,material_grams,base_price,catalog_audit_completed_at,catalog_audit_applied_at,categories(slug,name_en,name_ka)")
      .order("created_at", { ascending: false })
      .order("id", { ascending: true });
    if (q) productsQuery = productsQuery.or(`hooma_name.ilike.%${q}%,name_ka.ilike.%${q}%,original_name.ilike.%${q}%,original_model_code.ilike.%${q}%,slug.ilike.%${q}%`);
    if (status !== "all") productsQuery = productsQuery.eq("status", status);
    if (categoryIds.length) productsQuery = productsQuery.in("category_id", categoryIds);
    if ((category !== "all" || subcategory !== "all") && !categoryIds.length) productsQuery = null;
    if (audit === "approved") productsQuery = productsQuery?.not("catalog_audit_applied_at", "is", null);
    if (audit === "ready") productsQuery = productsQuery?.not("catalog_audit_completed_at", "is", null).is("catalog_audit_applied_at", null);
    if (audit === "pending") productsQuery = productsQuery?.is("catalog_audit_completed_at", null);
    const fallbackResponse = productsQuery
      ? await productsQuery.range(firstFrom, firstFrom + ADMIN_PRODUCTS_PER_PAGE)
      : { data: [], error: boundedResponse.error ?? categoryResponse.error ?? new Error("Catalog filters are unavailable") };
    productResponse = {
      data: (fallbackResponse.data ?? []).slice(0, ADMIN_PRODUCTS_PER_PAGE),
      error: fallbackResponse.error,
      hasMore: (fallbackResponse.data?.length ?? 0) > ADMIN_PRODUCTS_PER_PAGE,
    };
  }
  const currentPage = safeRequestedPage;
  const hasNextPage = productResponse.hasMore;

  const databaseProducts: CatalogProductListItem[] = (productResponse.data ?? []).map((row: any) => {
    const categoryRow = Array.isArray(row.categories) ? row.categories[0] : row.categories;
    const rowSlug = categoryRow?.slug || "";
    const catalogCategory = catalogCategories.find((item) => item.slug === rowSlug || item.subcategories.some((child) => child.slug === rowSlug));
    const catalogSubcategory = catalogCategory?.subcategories.find((child) => child.slug === rowSlug);
    return {
      id: row.id,
      name: row.name_ka || row.hooma_name,
      slug: row.slug,
      category: catalogCategory?.nameKa || categoryRow?.name_ka || categoryRow?.name_en || "—",
      categorySlug: catalogCategory?.slug || rowSlug,
      subcategory: catalogSubcategory?.nameKa || (catalogCategory?.slug === rowSlug ? "" : categoryRow?.name_ka || categoryRow?.name_en || ""),
      printMinutes: row.estimated_print_minutes,
      grams: row.material_grams,
      price: row.base_price === null ? null : Number(row.base_price),
      production: row.production_status,
      status: row.status,
      auditCompletedAt: row.catalog_audit_completed_at,
      auditAppliedAt: row.catalog_audit_applied_at,
    };
  });
  const productLoadError = productResponse.error ?? null;
  const canDelete = Boolean(profile && ["owner", "admin", "catalog_manager"].includes(profile.role));
  const canPublish = Boolean(profile && ["owner", "admin"].includes(profile.role));
  const canMoveAllToDraft = Boolean(profile && ["owner", "admin"].includes(profile.role));
  const visibleSubcategories = category === "all"
    ? catalogCategories
    : catalogCategories.filter((item) => item.slug === category);

  const buildHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (category !== "all") next.set("category", category);
    if (subcategory !== "all") next.set("subcategory", subcategory);
    if (status !== "all") next.set("status", status);
    if (!approvedOnly && audit !== "all") next.set("audit", audit);
    next.set("page", String(nextPage));
    return `${approvedOnly ? "/admin/audited-products" : "/admin/products"}?${next.toString()}`;
  };
  const productErrorMessage = productLoadError?.code === "57014"
    ? "ძიებამ დროის ლიმიტს გადააჭარბა. ახალი სწრაფი ძიების migration-ის გაშვების შემდეგ სცადე ხელახლა."
    : "პროდუქტების სია ვერ ჩაიტვირთა. სცადე ხელახლა.";

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">{approvedOnly ? "Curated catalog" : "Catalog"}</p><h1 className="mt-3 text-4xl font-medium">{approvedOnly ? "აუდიტ-დამტკიცებული პროდუქტები" : "პროდუქტები"}</h1><p className="mt-2 text-sm text-hooma-muted">{approvedOnly ? "აქ ჩანს მხოლოდ მენეჯერის მიერ შემოწმებული და დამტკიცებული აუდიტის მქონე პროდუქტები." : counts.error ? "კატალოგის სტატუსების შეჯამება დროებით მიუწვდომელია — პროდუქტების სია მაინც მუშაობს." : `${counts.total} პროდუქტი · ${counts.draft} Draft · ${counts.active} Active · ${counts.archived} Archived`}</p></div><div className="flex flex-wrap gap-2">{approvedOnly ? <Link href="/admin/products" className="rounded-full border border-hooma-text/10 bg-white px-5 py-3 text-sm font-medium">ყველა პროდუქტი</Link> : null}<Link href="/admin/products/new" className="rounded-full bg-hooma-text px-5 py-3 text-sm font-medium text-white">ახალი პროდუქტი</Link></div></div>
    {productLoadError ? <div className="flex flex-col justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 sm:flex-row sm:items-center"><span>{productErrorMessage}</span><Link href={buildHref(currentPage)} className="shrink-0 rounded-xl border border-amber-300 bg-white px-4 py-2 font-medium">ხელახლა ცდა</Link></div> : null}
    {!approvedOnly && canMoveAllToDraft && !counts.error ? <MoveAllProductsToDraft nonDraftCount={Math.max(0, counts.total - counts.draft)} /> : null}

    <form className={`grid gap-3 rounded-[1.5rem] bg-white/70 p-4 md:grid-cols-2 ${approvedOnly ? "xl:grid-cols-[minmax(220px,1fr)_190px_230px_150px_auto]" : "xl:grid-cols-[minmax(220px,1fr)_190px_230px_150px_210px_auto]"}`}>
      <input name="q" defaultValue={params.q} placeholder="პროდუქტის ძიება" className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent" />
      <select name="category" defaultValue={category} className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა კატეგორია</option>{catalogCategories.map((item) => <option key={item.slug} value={item.slug}>{item.nameKa}</option>)}</select>
      <select name="subcategory" defaultValue={subcategory} className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა ქვეკატეგორია</option>{visibleSubcategories.map((item) => <optgroup key={item.slug} label={item.nameKa}>{item.subcategories.map((child) => <option key={child.slug} value={child.slug}>{child.nameKa}</option>)}</optgroup>)}</select>
      <select name="status" defaultValue={status} className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა სტატუსი</option><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select>
      {!approvedOnly ? <select name="audit" defaultValue={audit} className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა აუდიტი</option><option value="approved">მენეჯერის მიერ დამტკიცებული</option><option value="ready">AI აუდიტი დასრულებული</option><option value="pending">აუდიტ-გაუვლელი</option></select> : null}
      <div className="flex gap-2"><button className="min-h-11 flex-1 rounded-xl bg-hooma-text px-5 text-sm font-medium text-white">გაფილტვრა</button><Link href={approvedOnly ? "/admin/audited-products" : "/admin/products"} className="grid min-h-11 place-items-center rounded-xl border border-hooma-text/10 px-4 text-sm">გასუფთავება</Link></div>
    </form>

    {!productLoadError ? <div className="flex flex-col gap-2 text-sm text-hooma-muted sm:flex-row sm:items-center sm:justify-between"><p><strong className="text-hooma-text">{databaseProducts.length}</strong> პროდუქტი ამ გვერდზე{hasNextPage ? " · მეტი შედეგიც არის" : ""}</p><p>გვერდი {currentPage} · გვერდზე მაქსიმუმ {ADMIN_PRODUCTS_PER_PAGE}</p></div> : null}
    {!productLoadError ? databaseProducts.length ? <CatalogProductTable products={databaseProducts} canDelete={canDelete} canPublish={canPublish} /> : <div className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/60 px-6 py-14 text-center"><p className="font-semibold">შესაბამისი პროდუქტი ვერ მოიძებნა</p><p className="mt-2 text-sm text-hooma-muted">შეცვალე ძიება ან გაასუფთავე ფილტრები.</p></div> : null}

    {!productLoadError && (currentPage > 1 || hasNextPage) ? <nav aria-label="Admin catalog pages" className="flex items-center justify-center gap-3 border-t border-hooma-text/10 pt-5">{currentPage > 1 ? <Link href={buildHref(currentPage - 1)} className="rounded-full border border-hooma-text/10 bg-white px-4 py-2 text-sm font-medium">წინა</Link> : <span className="rounded-full border border-hooma-text/10 px-4 py-2 text-sm text-hooma-muted/40">წინა</span>}<span className="min-w-28 text-center text-sm text-hooma-muted">გვერდი {currentPage}</span>{hasNextPage ? <Link href={buildHref(currentPage + 1)} className="rounded-full border border-hooma-text/10 bg-white px-4 py-2 text-sm font-medium">შემდეგი</Link> : <span className="rounded-full border border-hooma-text/10 px-4 py-2 text-sm text-hooma-muted/40">შემდეგი</span>}</nav> : null}
  </div>;
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<AdminProductParams> }) {
  return <AdminProductCatalogPage searchParams={searchParams} />;
}
