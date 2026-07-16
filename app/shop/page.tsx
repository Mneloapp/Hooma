import Link from "next/link";
import { ChevronDown, ChevronRight, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { catalogCategories, getCategory } from "@/data/catalog";
import { ProductGrid } from "@/components/ProductGrid";
import { getStorefrontCatalog } from "@/lib/storefront-catalog";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

type ShopParams = { category?: string; subcategory?: string; q?: string; material?: string; sort?: string };

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

  const activeFilters = [q ? `ძიება: ${q}` : null, selectedCategory?.nameKa, subcategory ? selectedCategory?.subcategories.find((item) => item.slug === subcategory)?.nameKa : null, material].filter(Boolean);

  const CategoryTree = ({ mobile = false }: { mobile?: boolean }) => (
    <nav className={cn("grid text-sm", mobile ? "max-h-[55vh] gap-1 overflow-y-auto pr-1" : "gap-1")}>
      <Link href={buildHref({}, ["category", "subcategory"])} className={cn("rounded-lg px-2 py-2 transition", !category ? "bg-hooma-panel font-semibold text-hooma-accent" : "text-hooma-muted hover:bg-hooma-panel/70 hover:text-hooma-text")}>ყველა კატეგორია</Link>
      {catalogCategories.map((item) => {
        const CategoryIcon = item.icon;
        const selected = category === item.slug;
        return (
          <div key={item.slug} className="border-t border-hooma-text/10 pt-2 first:border-0">
            <Link href={buildHref({ category: item.slug }, ["subcategory"])} className={cn("flex items-center gap-2 rounded-lg px-2 py-2 font-semibold transition", selected ? "bg-hooma-panel text-hooma-accent" : "text-hooma-text hover:bg-hooma-panel/70")}>
              <CategoryIcon size={16} className="shrink-0" />{item.nameKa}
            </Link>
            <div className="mb-2 ml-6 grid border-l border-hooma-text/10 pl-3">
              {item.subcategories.map((child) => (
                <Link key={child.slug} href={buildHref({ category: item.slug, subcategory: child.slug })} className={cn("rounded-md px-2 py-1.5 text-[13px] leading-5 transition", selected && subcategory === child.slug ? "bg-hooma-accent/10 font-semibold text-hooma-accent" : "text-hooma-muted hover:bg-hooma-panel/70 hover:text-hooma-text")}>{child.nameKa}</Link>
              ))}
            </div>
          </div>
        );
      })}
    </nav>
  );

  return (
    <main className="mx-auto max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8">
      <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1.5 overflow-x-auto text-xs text-hooma-muted hide-scrollbar">
        <Link href="/" className="hover:text-hooma-text">მთავარი</Link><ChevronRight size={13} /><Link href="/shop" className="hover:text-hooma-text">კატალოგი</Link>{selectedCategory ? <><ChevronRight size={13} /><span className="text-hooma-text">{selectedCategory.nameKa}</span></> : null}
      </nav>

      <section className="rounded-[1.5rem] bg-gradient-to-r from-hooma-text to-[#343c31] p-6 text-white sm:p-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#c8d8bd]">Hooma catalog</p>
        <div className="mt-3 flex flex-col justify-between gap-5 md:flex-row md:items-end">
          <div><h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{q ? `ძიების შედეგები: “${q}”` : selectedCategory?.nameKa ?? "ყველა პროდუქტი"}</h1><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">კატალოგის ნივთები მზადდება შეკვეთის შემდეგ და გადის ოპერატორის ხარისხის კონტროლს.</p></div>
          <form action="/shop" className="flex w-full max-w-md overflow-hidden rounded-xl bg-white text-hooma-text">
            {category ? <input type="hidden" name="category" value={category} /> : null}
            <input name="q" defaultValue={q} placeholder="ძიება ამ კატალოგში" className="h-11 min-w-0 flex-1 px-4 text-sm outline-none" />
            <button className="grid w-12 place-items-center bg-hooma-accent text-white" aria-label="ძიება"><Search size={18} /></button>
          </form>
        </div>
      </section>

      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
        <Link href={buildHref({}, ["category", "subcategory"])} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm transition", !category ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text")}>ყველა</Link>
        {catalogCategories.map((item) => <Link key={item.slug} href={buildHref({ category: item.slug }, ["subcategory"])} className={cn("shrink-0 rounded-full border px-4 py-2 text-sm transition", category === item.slug ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text")}>{item.nameKa}</Link>)}
      </div>

      <div className="mt-5 grid items-start gap-7 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="hidden max-h-[calc(100vh-9rem)] overflow-y-auto rounded-2xl border border-hooma-text/10 bg-white/65 p-5 lg:block lg:sticky lg:top-32">
          <div className="flex items-center gap-2 border-b border-hooma-text/10 pb-4"><Filter size={17} /><h2 className="font-semibold">ფილტრები</h2></div>

          <div className="py-5">
            <h3 className="text-sm font-semibold">კატეგორია</h3>
            <div className="mt-3"><CategoryTree /></div>
          </div>

          <div className="border-t border-hooma-text/10 py-5"><h3 className="text-sm font-semibold">მასალა</h3><div className="mt-3 grid gap-2 text-sm">{["PLA+", "PETG", "ASA", "TPU"].map((item) => <Link key={item} href={material === item ? buildHref({}, ["material"]) : buildHref({ material: item })} className="flex items-center gap-2 text-hooma-muted hover:text-hooma-text"><span className={cn("h-4 w-4 rounded border", material === item ? "border-hooma-accent bg-hooma-accent" : "border-hooma-text/20 bg-white")} />{item}</Link>)}</div></div>

          <div className="border-t border-hooma-text/10 pt-5"><h3 className="text-sm font-semibold">მიწოდების ვადა</h3><p className="mt-3 flex items-start gap-2 text-sm leading-5 text-hooma-muted"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-hooma-accent" />3 სამუშაო დღე შეკვეთიდან მიწოდებამდე</p></div>
        </aside>

        <div className="min-w-0">
          <div className="flex flex-col gap-3 border-b border-hooma-text/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-sm"><strong>{filtered.length}</strong> შედეგი</p>{activeFilters.length ? <div className="mt-2 flex flex-wrap gap-2">{activeFilters.map((item) => <span key={String(item)} className="rounded-full bg-hooma-panel px-2.5 py-1 text-xs text-hooma-muted">{item}</span>)}<Link href="/shop" className="flex items-center gap-1 text-xs text-hooma-accent"><X size={12} />გასუფთავება</Link></div> : null}</div>
            <div className="flex items-center gap-2">
              <details className="relative lg:hidden">
                <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl border border-hooma-text/10 bg-white px-3 py-2 text-sm"><SlidersHorizontal size={15} />ფილტრები</summary>
                <div className="absolute left-0 top-12 z-20 w-72 rounded-2xl border border-hooma-text/10 bg-white p-4 shadow-xl">
                  <p className="text-sm font-semibold">კატეგორია</p>
                  <div className="mt-3"><CategoryTree mobile /></div>
                  <p className="mt-4 border-t border-hooma-text/10 pt-4 text-sm font-semibold">მასალა</p>
                  <div className="mt-3 flex flex-wrap gap-2">{["PLA+", "PETG", "ASA", "TPU"].map((item) => <Link key={item} href={material === item ? buildHref({}, ["material"]) : buildHref({ material: item })} className={cn("rounded-full border px-3 py-1.5 text-xs", material === item ? "border-hooma-accent bg-hooma-accent text-white" : "border-hooma-text/10 text-hooma-muted")}>{item}</Link>)}</div>
                </div>
              </details>
              <form action="/shop" className="relative">
                {q ? <input type="hidden" name="q" value={q} /> : null}{category ? <input type="hidden" name="category" value={category} /> : null}{subcategory ? <input type="hidden" name="subcategory" value={subcategory} /> : null}{material ? <input type="hidden" name="material" value={material} /> : null}
                <div className="flex items-center gap-2"><div className="relative"><select name="sort" defaultValue={sort} aria-label="დალაგება" className="h-10 appearance-none rounded-xl border border-hooma-text/10 bg-white py-0 pl-3 pr-9 text-sm outline-none"><option value="featured">პოპულარული</option><option value="rating">უმაღლესი შეფასება</option><option value="sales">ყველაზე გაყიდვადი</option><option value="name">სახელის მიხედვით</option><option value="fastest">მომზადების დრო</option></select><ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-hooma-muted" /></div><button className="h-10 rounded-xl bg-hooma-text px-3 text-xs font-medium text-white">დალაგება</button></div>
              </form>
            </div>
          </div>

          <div className="mt-6">
            {filtered.length ? <ProductGrid products={filtered} /> : <div className="rounded-[1.5rem] border border-dashed border-hooma-text/20 bg-white/45 px-6 py-20 text-center"><p className="text-2xl font-semibold">შესაბამისი პროდუქტი ვერ მოიძებნა.</p><p className="mt-3 text-sm text-hooma-muted">შეცვალე ძიების სიტყვა ან გაასუფთავე არჩეული ფილტრები.</p><Link href="/shop" className="mt-6 inline-flex rounded-full bg-hooma-text px-5 py-2.5 text-sm font-medium text-white">ყველა პროდუქტი</Link></div>}
          </div>
        </div>
      </div>
    </main>
  );
}
