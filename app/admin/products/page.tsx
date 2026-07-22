import Link from "next/link";
import { CatalogProductTable, type CatalogProductListItem } from "@/components/admin/CatalogProductTable";
import { catalogCategories } from "@/data/catalog";
import { createClient, requirePermission } from "@/lib/supabase/server";

const ADMIN_PRODUCTS_PER_PAGE = 100;
const productStatuses = ["draft", "active", "archived"] as const;

type AdminProductParams = {
  q?: string;
  category?: string;
  subcategory?: string;
  status?: string;
  page?: string;
};

type DbCategory = { id: string; parent_id: string | null; slug: string };

function normalizedSearch(value: string | undefined) {
  return (value ?? "").trim().replace(/[^\p{L}\p{N}\s._-]/gu, " ").replace(/\s+/g, " ").slice(0, 100);
}

async function loadCatalogCounts(supabase: any) {
  const countStatus = (status?: string) => {
    let query = supabase.from("products").select("id", { count: "exact", head: true });
    if (status) query = query.eq("status", status);
    return query;
  };
  const [total, draft, active, archived] = await Promise.all([
    countStatus(),
    countStatus("draft"),
    countStatus("active"),
    countStatus("archived"),
  ]);
  return {
    total: total.count ?? 0,
    draft: draft.count ?? 0,
    active: active.count ?? 0,
    archived: archived.count ?? 0,
    error: total.error ?? draft.error ?? active.error ?? archived.error ?? null,
  };
}

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<AdminProductParams> }) {
  const params = await searchParams;
  const q = normalizedSearch(params.q);
  const category = params.category ?? "all";
  const subcategory = params.subcategory ?? "all";
  const status = productStatuses.includes(params.status as typeof productStatuses[number]) ? params.status! : "all";
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const profile = await requirePermission("catalog.manage");
  const supabase = (await createClient()) as any;

  const [{ data: categoryRows, error: categoryError }, counts] = supabase
    ? await Promise.all([
      supabase.from("categories").select("id,parent_id,slug").order("sort_order", { ascending: true }),
      loadCatalogCounts(supabase),
    ])
    : [{ data: [], error: new Error("Supabase is not configured") }, { total: 0, draft: 0, active: 0, archived: 0, error: new Error("Supabase is not configured") }];

  const dbCategories = (categoryRows ?? []) as DbCategory[];
  const parentCategory = dbCategories.find((item) => item.slug === category && item.parent_id === null);
  const selectedSubcategory = dbCategories.find((item) => item.slug === subcategory
    && item.parent_id !== null
    && (!parentCategory || item.parent_id === parentCategory.id));
  const categoryIds = selectedSubcategory
    ? [selectedSubcategory.id]
    : parentCategory
      ? [parentCategory.id, ...dbCategories.filter((item) => item.parent_id === parentCategory.id).map((item) => item.id)]
      : [];

  let productsQuery = supabase
    ?.from("products")
    .select("id,slug,hooma_name,name_ka,status,production_status,estimated_print_minutes,material_grams,base_price,catalog_audit_completed_at,categories(slug,name_en,name_ka)", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (q) productsQuery = productsQuery.or(`hooma_name.ilike.%${q}%,name_ka.ilike.%${q}%,slug.ilike.%${q}%`);
  if (status !== "all") productsQuery = productsQuery.eq("status", status);
  if (categoryIds.length) productsQuery = productsQuery.in("category_id", categoryIds);

  const safeRequestedPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const firstFrom = (safeRequestedPage - 1) * ADMIN_PRODUCTS_PER_PAGE;
  let productResponse = productsQuery
    ? await productsQuery.range(firstFrom, firstFrom + ADMIN_PRODUCTS_PER_PAGE - 1)
    : { data: [], count: 0, error: new Error("Supabase is not configured") };
  const filteredCount = productResponse.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(filteredCount / ADMIN_PRODUCTS_PER_PAGE));
  const currentPage = Math.min(safeRequestedPage, totalPages);
  if (currentPage !== safeRequestedPage && productsQuery) {
    const from = (currentPage - 1) * ADMIN_PRODUCTS_PER_PAGE;
    productResponse = await productsQuery.range(from, from + ADMIN_PRODUCTS_PER_PAGE - 1);
  }

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
    };
  });
  const productLoadError = categoryError ?? counts.error ?? productResponse.error ?? null;
  const canDelete = Boolean(profile && ["owner", "admin", "catalog_manager"].includes(profile.role));
  const canPublish = Boolean(profile && ["owner", "admin"].includes(profile.role));
  const visibleSubcategories = category === "all"
    ? catalogCategories
    : catalogCategories.filter((item) => item.slug === category);

  const buildHref = (nextPage: number) => {
    const next = new URLSearchParams();
    if (params.q) next.set("q", params.q);
    if (category !== "all") next.set("category", category);
    if (subcategory !== "all") next.set("subcategory", subcategory);
    if (status !== "all") next.set("status", status);
    next.set("page", String(nextPage));
    return `/admin/products?${next.toString()}`;
  };

  return <div className="space-y-6">
    <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog</p><h1 className="mt-3 text-4xl font-medium">პროდუქტები</h1><p className="mt-2 text-sm text-hooma-muted">{`${counts.total} პროდუქტი · ${counts.draft} Draft · ${counts.active} Active · ${counts.archived} Archived`}</p></div><Link href="/admin/products/new" className="rounded-full bg-hooma-text px-5 py-3 text-sm font-medium text-white">ახალი პროდუქტი</Link></div>
    {productLoadError ? <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">პროდუქტების სრული სია ვერ ჩაიტვირთა. სცადე გვერდის განახლება.</div> : null}

    <form className="grid gap-3 rounded-[1.5rem] bg-white/70 p-4 md:grid-cols-2 xl:grid-cols-[minmax(220px,1fr)_220px_260px_170px_auto]">
      <input name="q" defaultValue={params.q} placeholder="პროდუქტის ძიება" className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent" />
      <select name="category" defaultValue={category} className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა კატეგორია</option>{catalogCategories.map((item) => <option key={item.slug} value={item.slug}>{item.nameKa}</option>)}</select>
      <select name="subcategory" defaultValue={subcategory} className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა ქვეკატეგორია</option>{visibleSubcategories.map((item) => <optgroup key={item.slug} label={item.nameKa}>{item.subcategories.map((child) => <option key={child.slug} value={child.slug}>{child.nameKa}</option>)}</optgroup>)}</select>
      <select name="status" defaultValue={status} className="min-h-11 rounded-xl border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent"><option value="all">ყველა სტატუსი</option><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></select>
      <div className="flex gap-2"><button className="min-h-11 flex-1 rounded-xl bg-hooma-text px-5 text-sm font-medium text-white">გაფილტვრა</button><Link href="/admin/products" className="grid min-h-11 place-items-center rounded-xl border border-hooma-text/10 px-4 text-sm">გასუფთავება</Link></div>
    </form>

    <div className="flex flex-col gap-2 text-sm text-hooma-muted sm:flex-row sm:items-center sm:justify-between"><p><strong className="text-hooma-text">{filteredCount}</strong> შესაბამისი პროდუქტი</p><p>გვერდი {currentPage} / {totalPages} · გვერდზე მაქსიმუმ {ADMIN_PRODUCTS_PER_PAGE}</p></div>
    {databaseProducts.length ? <CatalogProductTable products={databaseProducts} canDelete={canDelete} canPublish={canPublish} /> : <div className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/60 px-6 py-14 text-center"><p className="font-semibold">შესაბამისი პროდუქტი ვერ მოიძებნა</p><p className="mt-2 text-sm text-hooma-muted">შეცვალე ძიება ან გაასუფთავე ფილტრები.</p></div>}

    {totalPages > 1 ? <nav aria-label="Admin catalog pages" className="flex items-center justify-center gap-3 border-t border-hooma-text/10 pt-5">{currentPage > 1 ? <Link href={buildHref(currentPage - 1)} className="rounded-full border border-hooma-text/10 bg-white px-4 py-2 text-sm font-medium">წინა</Link> : <span className="rounded-full border border-hooma-text/10 px-4 py-2 text-sm text-hooma-muted/40">წინა</span>}<span className="min-w-28 text-center text-sm text-hooma-muted">{currentPage} / {totalPages}</span>{currentPage < totalPages ? <Link href={buildHref(currentPage + 1)} className="rounded-full border border-hooma-text/10 bg-white px-4 py-2 text-sm font-medium">შემდეგი</Link> : <span className="rounded-full border border-hooma-text/10 px-4 py-2 text-sm text-hooma-muted/40">შემდეგი</span>}</nav> : null}
  </div>;
}
