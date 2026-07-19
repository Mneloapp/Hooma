import type { Product } from "@/data/products";
import { toProductCardData } from "@/lib/product-card";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

export function ProductGrid({ products }: { products: Product[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product, index) => (
        index < 6
          ? <ProductCard key={product.id} product={toProductCardData(product)} />
          : <Reveal key={product.id} delay={(index % 6) * 55}><ProductCard product={toProductCardData(product)} /></Reveal>
      ))}
    </div>
  );
}
