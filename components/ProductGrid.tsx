import type { ProductCardData } from "@/lib/product-card";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {products.map((product, index) => (
        index < 6
          ? <ProductCard key={product.id} product={product} compact imageSizes="(min-width: 1280px) 350px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" />
          : <Reveal key={product.id} delay={(index % 6) * 55}><ProductCard product={product} compact imageSizes="(min-width: 1280px) 350px, (min-width: 1024px) 30vw, (min-width: 640px) 45vw, 100vw" /></Reveal>
      ))}
    </div>
  );
}
