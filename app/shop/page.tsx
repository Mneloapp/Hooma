import Link from "next/link";
import { ChevronRight, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { catalogCategories, getCategory } from "@/data/catalog";
import { ProductGrid } from "@/components/ProductGrid";
import { getStorefrontCatalog } from "@/lib/storefront-catalog";
import { cn } from "@/lib/utils";
import { LocalizedText } from "@/components/LocalizedText";
import { ShopSearchInput, ShopSortSelect } from "@/components/ShopSortSelect";

export const dynamic = "force-dynamic";

type ShopParams = { category?: string; subcategory?: string; q?: string; material?: string; sort?: string; page?: string };

const PRODUCTS_PER_PAGE = 36;

export default async function Shop({ searchParams }: { searchParams: Promise<ShopParams> }) {
  const params = await searchParams;
  const { category, subcategory, q = "", material, sort = "featured" } = params;
  const selectedCategory = category ? getCategory(category) : undefined;
  const query = q.trim().toLocaleLowerCase("ka-GE");
  const products = await getStorefrontCatalog();

  const buildHref = (changes: Partial<ShopParams>, clear: Array<keyof ShopParams> = []) => {
    const next = new URLSearchParams();
    const merged = { ...params, ...changes };
    clear.forEach((key) => delete merged[key]);
    const changesCatalogView = [...Object.keys(changes), ...clear].some((key) => key !== "page");
    if (changesCatalogView) delete merged.page;
    Object.entries(merged).forEach(([key, value]) => { if (value) next.set(key, value); });
    const value = next.toString();
    return value ? `/shop?${value}` : "/shop";
  };

  const catalogProducts = products.filter((product) => product.categorySlug !== "custom-parts");
  const filtered = catalogProducts
    .filter((product) => {
      if (category && product.categorySlug !== category) return false;
      if (subcategory && product.subcategorySlug !== subcategory) return false;
      if (material && !product.availableMaterials.includes(material)) return false;
      if (query) {
        const haystack = [product.nameKa, product.hoomaName, product.shortDescriptionKa, product.category, product.subcategory, ...product.tags].join(" ").toLocaleLowerCase("ka-GE");
        if (!haystack.includes(query)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === "name") return a.nameKa.localeCompare(b.nameKa, "ka");
      if (sort === "fastest") return a.leadTimeDays - b.leadTimeDays;
      if (sort === "rating") return b.ratingAverage - a.ratingAverage || b.ratingCount - a.ratingCount;
      if (sort === "sales") return b.salesCount - a.salesCount || b.popularityScore - a.popularityScore;
      return b.popularityScore - a.popularityScore || Number(b.isFeatured) - Number(a.isFeatured);
    });

  const selectedSubcategory = subcategory ? selectedCategory?.subcategories.find((item) => item.slug === subcategory) : undefined;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PRODUCTS_PER_PAGE));
  const currentPage = Math.min(Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1, totalPages);
  const pagedProducts = filtered.slice((currentPage - 1) * PRODUCTS_PER_PAGE, currentPage * PRODUCTS_PER_PAGE);
  const activeFilters = [
    q ? { ka: `ძიება: ${q}`, en: `Search: ${q}` } : null,
    selectedCategory ? { ka: selectedCategory.nameKa, en: selectedCategory.name } : null,
    selectedSubcategory ? { ka: selectedSubcategory.nameKa, en: selectedSubcategory.name } : null,
    material ? { ka: material, en: material } : null,
  ].filter((item): item is { ka: string; en: string } => Boolean(item));

  const CategoryTree = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn("grid text-sm", mobile ? "max-h-[55vh] gap-1 overflow-y-auto pr-1" : "gap-1")}>
      <Link href={buildHref({}, ["category", "subcategory"])} className={cn("rounded-lg px-2 py-2 transition", !category ? "bg-hooma-panel font-semibold text-hooma-accent" : "text-hooma-muted hover:bg-hooma-panel/70 hover:text-hooma-text")}><LocalizedText ka="ყველა კატეგორია" en="All categories" /></Link>
      {catalogCategories.map((item) => {
        const CategoryIcon = item.icon;
        const selected = category === item.slug;
        return (
          <div key={item.slug} className="border-t border-hooma-text/10 pt-2 first:border-0">
            <Link href={buildHref({ category: item.slug }, ["subcategory"])} className={cn("flex items-center gap-2 rounded-lg px-2 py-2 font-semibold transition", selected ? "bg-hooma-panel text-hooma-accent" : "text-hooma-text hover:bg-hooma-panel/70")}>
              <CategoryIcon size={16} className="shrink-0" />
              <span className="min-w-0 flex-1"><LocalizedText ka={item.nameKa} en={item.name} /></span>
              <ChevronRight size={14} className={cn("shrink-0 transition-transform", selected && "rotate-90")} />
            </Link>
            {selected ? <div className="mb-2 ml-6 grid border-l border-hooma-text/10 pl-3">
              {item.subcategories.map((child) => (
                <Link key={child.slug} href={buildHref({ category: item.slug, subcategory: child.slug })} className={cn("rounded-md px-2 py-1.5 text-[13px] leading-5 transition", selected && subcategory === child.slug ? "bg-hooma-accent/10 font-semibold text-hooma-accent" : "text-hooma-muted hover:bg-hooma-panel/70 hover:text-hooma-text")}><LocalizedText ka={child.nameKa} en={child.name} /></Link>
              ))}
            </div> : null}
          </div>
        );
      })}
    </nav>
  );

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 overflow-x-auto text-xs text-hooma-muted hide-scrollbar">
        <Link href="/" className="hover:text-hooma-text"><LocalizedText ka="მთავარი" en="Home" /></Link><ChevronRight size={13} /><Link href="/shop" className="hover:text-hooma-text"><LocalizedText ka="კატალოგი" en="Catalog" /></Link>{selectedCategory ? <><ChevronRight size={13} /><span className="text-hooma-text"><LocalizedText ka={selectedCategory.nameKa} en={selectedCategory.name} /></span></> : null}
      </nav>

      <section className="rounded-[1.5rem] bg-gradient-to-r from-hooma-text via-[#34486B] to-[#6A3F6F] p-6 text-white sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-hooma-secondary"><LocalizedText ka="Hooma-ს კატალოგი" en="Hooma catalog" /></p>
        <div className="mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl"><LocalizedText ka={q ? `ძიების შედეგები: “${q}”` : selectedCategory?.nameKa ?? "ყველა პროდუქტი"} en={q ? `Search results: “${q}”` : selectedCategory?.name ?? "All products"} /></h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60"><LocalizedText ka="კატალოგის ნივთები მზადდება შეკვეთის შემდეგ და გადის ოპერატორის ხარისხის კონტროლს." en="Catalog items are made after you order and pass operator quality control." /></p></div>
          <form action="/shop" className="flex w-full max-w-md overflow-hidden rounded-xl bg-white text-hooma-text">
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <ShopSearchInput defaultValue={q} />
            <button className="grid w-12 place-items-center bg-hooma-accent text-white" aria-label="Search"><Search size={18} /></button>
          </form>
        </div>
      </section>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
        <Link href={buildHref({}, ["category", "subcategory"])} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm transition", !category ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text")}><LocalizedText ka="ყველა" en="All" /></Link>
        {catalogCategories.map((item) => <Link key={item.slug} href={buildHref({ category: item.slug }, ["subcategory"])} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm transition", category === item.slug ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text")}><LocalizedText ka={item.nameKa} en={item.name} /></Link>)}
      </div>

      <div className="mt-5 grid items-start gap-7 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border border-hooma-text/10 bg-white/65 p-5 lg:block lg:sticky lg:top-32">
          <div className="flex items-center gap-2 border-b border-hooma-text/10 pb-4"><Filter size={17} /><h2 className="font-semibold"><LocalizedText ka="ფილტრები" en="Filters" /></h2></div>

          <div className="py-5">
            <h3 className="text-sm font-semibold"><LocalizedText ka="კატეგორია" en="Category" /></h3>
            <div className="mt-3"><CategoryTree /></div>
          </div>

          <div className="border-t border-hooma-text/10 py-5"><h3 className="text-sm font-semibold"><LocalizedText ka="მასალა" en="Material" /></h3><div className="mt-3 grid gap-2 text-sm">{["PLA+", "PETG", "ASA", "TPU"].map((item) => <Link key={item} href={material === item ? buildHref({}, ["material"]) : buildHref({ material: item })} className="flex items-center gap-2 text-hooma-muted hover:text-hooma-text"><span className={cn("h-4 w-4 rounded border", material === item ? "border-hooma-accent bg-hooma-accent" : "border-hooma-text/20 bg-white")} />{item}</Link>)}</div></div>

          <div className="border-t border-hooma-text/10 pt-5"><h3 className="text-sm font-semibold"><LocalizedText ka="მიწოდების ვადა" en="Delivery time" /></h3><p className="mt-3 flex items-start gap-2 text-sm leading-5 text-hooma-muted"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-hooma-accent" /><LocalizedText ka="3 სამუშაო დღე შეკვეთიდან მიწოდებამდე" en="3 business days from order to delivery" /></p></div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-hooma-text/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm"><strong>{filtered.length}</strong> <LocalizedText ka="შედეგი" en={filtered.length === 1 ? "result" : "results"} /></p>{activeFilters.length ? <div className="mt-2 flex flex-wrap gap-2">{activeFilters.map((item) => <span key={item.ka} className="rounded-full bg-hooma-panel px-2.5 py-1 text-xs text-hooma-muted"><LocalizedText ka={item.ka} en={item.en} /></span>)}<Link href="/shop" className="flex items-center gap-1 text-xs text-hooma-accent"><X size={12} /><LocalizedText ka="გასუფთავება" en="Clear" /></Link></div> : null}</div>
            <div className="flex items-center gap-2">
              <details className="relative lg:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-hooma-text/10 bg-white px-3 py-2 text-sm"><SlidersHorizontal size={15} /><LocalizedText ka="ფილტრები" en="Filters" /></summary>
                <div className="absolute left-0 top-12 z-20 w-72 rounded-2xl border border-hooma-text/10 bg-white p-4 shadow-xl">
                  <p className="text-sm font-semibold"><LocalizedText ka="კატეგორია" en="Category" /></p>
                  <div className="mt-3"><CategoryTree mobile /></div>
                  <p className="mt-4 border-t border-hooma-text/10 pt-4 text-sm font-semibold"><LocalizedText ka="მასალა" en="Material" /></p>
                  <div className="mt-3 flex flex-wrap gap-2">{["PLA+", "PETG", "ASA", "TPU"].map((item) => <Link key={item} href={material === item ? buildHref({}, ["material"]) : buildHref({ material: item })} className={cn("rounded-full border px-3 py-1.5 text-xs", material === item ? "border-hooma-accent bg-hooma-accent text-white" : "border-hooma-text/10 text-hooma-muted")}>{item}</Link>)}</div>
                </div>
              </details>
              <form action="/shop" className="relative">
                {q ? <input type="hidden" name="q" value={q} /> : null}{category ? <input type="hidden" name="category" value={category} /> : null}{subcategory ? <input type="hidden" name="subcategory" value={subcategory} /> : null}{material ? <input type="hidden" name="material" value={material} /> : null}
                <div className="flex items-center gap-2"><ShopSortSelect defaultValue={sort} /><button className="h-10 rounded-xl bg-hooma-text px-3 text-xs font-medium text-white"><LocalizedText ka="დალაგება" en="Sort" /></button></div>
              </form>
            </div>
          </div>

          <div className="mt-6">
            {filtered.length ? <ProductGrid products={pagedProducts} /> : <div className="rounded-[1.5rem] border border-dashed border-hooma-text/20 bg-white/45 px-6 py-20 text-center"><p className="text-2xl font-semibold"><LocalizedText ka="შესაბამისი პროდუქტი ვერ მოიძებნა." en="No matching products found." /></p><p className="mt-3 text-sm text-hooma-muted"><LocalizedText ka="შეცვალე ძიების სიტყვა ან გაასუფთავე არჩეული ფილტრები." en="Change your search or clear the selected filters." /></p><Link href="/shop" className="mt-6 inline-flex rounded-full bg-hooma-text px-5 py-2.5 text-sm font-medium text-white"><LocalizedText ka="ყველა პროდუქტი" en="All products" /></Link></div>}
          </div>

          {totalPages > 1 ? <nav aria-label="Catalog pages" className="mt-8 flex items-center justify-center gap-3 border-t border-hooma-text/10 pt-6">
            {currentPage > 1 ? <Link href={buildHref({ page: String(currentPage - 1) })} className="rounded-full border border-hooma-text/10 bg-white px-4 py-2 text-sm font-medium hover:border-hooma-accent/40"><LocalizedText ka="წინა" en="Previous" /></Link> : <span className="cursor-not-allowed rounded-full border border-hooma-text/10 px-4 py-2 text-sm text-hooma-muted/45"><LocalizedText ka="წინა" en="Previous" /></span>}
            <span className="min-w-28 text-center text-sm text-hooma-muted"><LocalizedText ka={`გვერდი ${currentPage} / ${totalPages}`} en={`Page ${currentPage} / ${totalPages}`} /></span>
            {currentPage < totalPages ? <Link href={buildHref({ page: String(currentPage + 1) })} className="rounded-full border border-hooma-text/10 bg-white px-4 py-2 text-sm font-medium hover:border-hooma-accent/40"><LocalizedText ka="შემდეგი" en="Next" /></Link> : <span className="cursor-not-allowed rounded-full border border-hooma-text/10 px-4 py-2 text-sm text-hooma-muted/45"><LocalizedText ka="შემდეგი" en="Next" /></span>}
          </nav> : null}
        </div>
      </div>
    </main>
  );
}
