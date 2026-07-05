import Link from "next/link";
import { products } from "@/data/products";
import { ProductGrid } from "@/components/ProductGrid";
import { SectionTitle } from "@/components/SectionTitle";
import { cn } from "@/lib/utils";

const categories = ["Sofas", "Sofa Beds", "Lounge Chairs", "Ottomans", "Pet Collection"];

export default async function Shop({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const filtered = category ? products.filter((product) => product.category === category) : products;

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Collection" title={category ?? "Shop HOOMA"} copy="Compressed furniture, edited into a premium modern collection." />
      <div className="mb-10 flex gap-2 overflow-x-auto pb-2 hide-scrollbar">
        <Link
          href="/shop"
          className={cn(
            "shrink-0 rounded-full border px-4 py-2 text-sm transition",
            !category ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text",
          )}
        >
          All
        </Link>
        {categories.map((item) => (
          <Link
            key={item}
            href={`/shop?category=${encodeURIComponent(item)}`}
            className={cn(
              "shrink-0 rounded-full border px-4 py-2 text-sm transition",
              category === item ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/10 bg-white text-hooma-muted hover:text-hooma-text",
            )}
          >
            {item}
          </Link>
        ))}
      </div>
      <ProductGrid products={filtered} />
    </section>
  );
}
