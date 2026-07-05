import Image from "next/image";
import Link from "next/link";
import type { Product } from "@/data/products";
import { Badge } from "./Badge";

export function ProductCard({ product }: { product: Product }) {
  const secondaryImage = product.galleryImages.find((image) => image !== product.heroImage) ?? product.heroImage;

  return (
    <Link href={`/product/${product.slug}`} className="group block">
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm transition duration-500 group-hover:-translate-y-1 group-hover:shadow-soft">
        <div className="relative aspect-[4/3] overflow-hidden bg-hooma-panel">
          <Image src={product.heroImage} alt={product.hoomaName} fill className="object-cover transition duration-700 group-hover:scale-105 group-hover:opacity-0" sizes="(min-width: 1024px) 33vw, 100vw" />
          <Image src={secondaryImage} alt={`${product.hoomaName} alternate view`} fill className="object-cover opacity-0 transition duration-700 group-hover:scale-105 group-hover:opacity-100" sizes="(min-width: 1024px) 33vw, 100vw" />
          <div className="absolute inset-x-4 bottom-4 flex translate-y-3 items-center justify-between rounded-full bg-white/86 px-4 py-3 text-xs font-medium opacity-0 shadow-sm backdrop-blur-md transition duration-300 group-hover:translate-y-0 group-hover:opacity-100">
            <span>Configure piece</span>
            <span className="text-hooma-accent">Open</span>
          </div>
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
