import { products } from "@/data/products";
import { ProductGrid } from "@/components/ProductGrid";
import { SectionTitle } from "@/components/SectionTitle";

export default async function Shop({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const { category } = await searchParams;
  const filtered = category ? products.filter((product) => product.category === category) : products;

  return (
    <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Collection" title={category ?? "Shop HOOMA"} copy="Compressed furniture, edited into a premium modern collection." />
      <ProductGrid products={filtered} />
    </section>
  );
}
