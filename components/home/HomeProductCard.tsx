"use client";

import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { getCategory } from "@/data/catalog";
import type { ProductCardData } from "@/lib/product-card";
import { useLanguage } from "@/components/LanguageProvider";

const homeImageSizes = "(min-width: 1280px) calc((100vw - 192px) / 6), (min-width: 1024px) calc((100vw - 160px) / 4), (min-width: 640px) calc((100vw - 128px) / 3), calc((100vw - 68px) / 2)";

export function HomeProductCard({ product, showPrice = false }: { product: ProductCardData; showPrice?: boolean }) {
  const { language } = useLanguage();
  const category = getCategory(product.categorySlug);
  const subcategory = category?.subcategories.find((item) => item.slug === product.subcategorySlug);
  const productName = language === "ka" ? product.nameKa : product.hoomaName;
  const subcategoryLabel = language === "ka"
    ? subcategory?.nameKa ?? product.subcategory
    : subcategory?.name ?? product.subcategory;
  const href = product.href ?? (product.categorySlug === "custom-parts" ? "/account/custom-orders" : `/product/${product.slug}`);
  const priceLabel = product.price === null
    ? (language === "ka" ? product.pricePlaceholder : "Price after review")
    : `₾${product.price.toFixed(2)}`;
  const showOriginalPrice = showPrice
    && product.originalPrice !== null
    && product.originalPrice !== undefined
    && product.price !== null
    && product.originalPrice > product.price;

  return (
    <Link
      href={href}
      className="group block h-full rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent focus-visible:ring-offset-2"
    >
      <article className="flex h-full flex-col overflow-hidden rounded-2xl border border-hooma-text/10 bg-white/85 transition duration-300 group-hover:-translate-y-1 group-hover:border-hooma-accent/35 group-hover:shadow-soft">
        <div className="relative aspect-[4/3] overflow-hidden bg-hooma-panel">
          <Image
            src={product.heroImage}
            alt=""
            fill
            className="object-cover transition duration-500 group-hover:scale-[1.035]"
            sizes={homeImageSizes}
          />
          {showPrice && product.discountPercent ? (
            <span className="absolute left-2.5 top-2.5 rounded-full bg-hooma-accent px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
              −{product.discountPercent}%
            </span>
          ) : null}
          {!product.isOrderable ? (
            <span className="absolute right-2.5 top-2.5 rounded-full bg-white/90 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.14em] text-hooma-text">
              Preview
            </span>
          ) : null}
          <span aria-hidden="true" className="absolute bottom-2.5 right-2.5 grid h-8 w-8 translate-y-1 place-items-center rounded-full bg-hooma-text/88 text-white opacity-0 backdrop-blur transition group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100">
            <ArrowUpRight size={15} />
          </span>
        </div>

        <div className="flex flex-1 flex-col p-3 sm:p-3.5">
          <p className="truncate text-[10px] font-medium uppercase tracking-[0.12em] text-hooma-muted">{subcategoryLabel}</p>
          <h3 className="mt-1.5 line-clamp-2 min-h-10 text-sm font-semibold leading-5 tracking-tight sm:text-[15px]">{productName}</h3>
          {showPrice ? (
            <div className="mt-auto flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-2.5">
              <span className="text-sm font-bold text-hooma-accent sm:text-base">
                {priceLabel}
              </span>
              {showOriginalPrice ? <span className="text-[10px] text-hooma-muted line-through sm:text-xs">₾{product.originalPrice!.toFixed(2)}</span> : null}
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
