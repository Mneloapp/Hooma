import type { ProductCardData } from "@/lib/product-card";
import { ProductCard } from "./ProductCard";
import { Reveal } from "./Reveal";

export function ProductGrid({ products }: { products: ProductCardData[] }) {
  const imageSizes = "(min-width: 1480px) 272px, (min-width: 1280px) calc((100vw - 392px) / 4), (min-width: 1024px) calc((100vw - 372px) / 3), (min-width: 640px) calc((100vw - 68px) / 2), calc(100vw - 32px)";

  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {products.map((product, index) => (
        index < 6
          ? <ProductCard key={product.id} product={product} compact imageSizes={imageSizes} />
          : <Reveal key={product.id} delay={(index % 6) * 55}><ProductCard product={product} compact imageSizes={imageSizes} /></Reveal>
      ))}
    </div>
  );
}
