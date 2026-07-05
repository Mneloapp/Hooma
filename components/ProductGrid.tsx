import type { Product } from "@/data/products";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product, index) => (
        <Reveal key={product.id} delay={(index % 6) * 55}>
          <ProductCard product={product} />
        </Reveal>
      ))}
    </div>
  );
}
