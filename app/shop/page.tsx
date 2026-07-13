import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { catalogCategories, getCategory } from "@/data/catalog";
import { products } from "@/data/products";
import { ProductGrid } from "@/components/ProductGrid";
import { cn } from "@/lib/utils";

export default async function Shop({ searchParams }: { searchParams: Promise<{ category?: string; subcategory?: string }> }) {
  const { category, subcategory } = await searchParams;
  const selectedCategory = category ? getCategory(category) : undefined;
  const filtered = products.filter((product) => {
    if (category && product.categorySlug !== category) return false;
    if (subcategory && product.subcategorySlug !== subcategory) return false;
    return true;
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="rounded-[2rem] bg-hooma-text p-7 text-white md:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">Hooma catalog</p>
        <div className="mt-4 flex flex-col justify-between gap-6 md:flex-row md:items-end">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight md:text-6xl">{selectedCategory?.nameKa ?? "პროდუქტები ყოველდღიურობისთვის"}</h1>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-white/60">შერჩეული პროდუქტები მზადდება შეკვეთის შემდეგ და გადის ოპერატორის ხარისხის კონტროლს.</p>
          </div>
          <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/60">{filtered.length} პროდუქტი</div>
        </div>
      </div>

      <div className="mt-8 flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
        <Link href="/shop" className={cn("shrink-0 rounded-full border px-4 py-2.5 text-sm transition", !category ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text")}>ყველა</Link>
        {catalogCategories.map((item) => (
          <Link key={item.slug} href={`/shop?category=${item.slug}`} className={cn("shrink-0 rounded-full border px-4 py-2.5 text-sm transition", category === item.slug ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text")}>{item.nameKa}</Link>
        ))}
      </div>

      {selectedCategory ? (
        <div className="mt-5 grid gap-3 rounded-[1.5rem] border border-hooma-text/10 bg-white/50 p-4 sm:grid-cols-2 lg:grid-cols-4">
          {selectedCategory.subcategories.map((item) => (
            <Link key={item.slug} href={`/shop?category=${selectedCategory.slug}&subcategory=${item.slug}`} className={cn("flex items-center justify-between rounded-xl px-4 py-3 text-sm transition", subcategory === item.slug ? "bg-hooma-accent text-white" : "bg-white text-hooma-muted hover:text-hooma-text")}>
              {item.nameKa}<ChevronRight size={15} />
            </Link>
          ))}
        </div>
      ) : null}

      <div className="mt-10">
        {filtered.length ? <ProductGrid products={filtered} /> : (
          <div className="rounded-[2rem] border border-dashed border-hooma-text/20 bg-white/45 px-6 py-20 text-center">
            <p className="text-2xl font-semibold">ამ ქვეკატეგორიაში პროდუქტები მალე დაემატება.</p>
            <p className="mt-3 text-sm text-hooma-muted">კატალოგი შეივსება მხოლოდ წარმოებისა და ლიცენზიის შემოწმების შემდეგ.</p>
          </div>
        )}
      </div>
    </div>
  );
}
