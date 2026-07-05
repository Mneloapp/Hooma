import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/data/products";
import { Badge } from "./Badge";

export function ProductCard({ product }: { product: Product }) {
  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm transition duration-300 group-hover:-translate-y-1 group-hover:shadow-soft">
        <div className="relative aspect-[4/3] overflow-hidden bg-hooma-panel">
          <Image src={product.heroImage} alt={product.hoomaName} fill className="object-cover transition duration-500 group-hover:scale-105" sizes="(min-width: 1024px) 33vw, 100vw" />
        </div>
        <div className="p-5">
          <div className="mb-3 flex items-center justify-between gap-3">
            <Badge>{product.category}</Badge>
            <span className="text-xs text-hooma-muted">{product.originalModelCode}</span>
          </div>
          <h3 className="text-xl font-semibold">{product.hoomaName}</h3>
          <p className="mt-2 min-h-12 text-sm leading-6 text-hooma-muted">{product.shortDescription}</p>
          <div className="mt-5 flex items-center justify-between text-sm">
            <span>{product.pricePlaceholder}</span>
            <span className="text-hooma-accent">View details</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
