"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { ProductCardData } from "@/lib/product-card";
import { useLanguage } from "./LanguageProvider";
import { ProductRatingSummary } from "@/components/reviews/ProductRatingSummary";
import { getCategory } from "@/data/catalog";

export function ProductCard({ product, compact = false }: { product: ProductCardData; compact?: boolean }) {
  const { language } = useLanguage();
  const category = getCategory(product.categorySlug);
  const subcategory = category?.subcategories.find((item) => item.slug === product.subcategorySlug);
  const href = product.href ?? (product.categorySlug === "custom-parts" ? "/account/custom-orders" : `/product/${product.slug}`);
  const showOriginalPrice = product.originalPrice !== null
    && product.originalPrice !== undefined
    && product.price !== null
    && product.originalPrice > product.price;

  return (
    <Link href={href} className="group block">
      <div className={`overflow-hidden border border-hooma-text/10 bg-white/80 transition duration-300 group-hover:-translate-y-1.5 group-hover:border-hooma-accent/35 group-hover:shadow-soft ${compact ? "rounded-2xl" : "rounded-[1.5rem]"}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-hooma-panel">
          <Image src={product.heroImage} alt={language === "ka" ? product.nameKa : product.hoomaName} fill className="object-cover transition duration-700 group-hover:scale-[1.025]" sizes="(min-width: 1024px) 33vw, 100vw" />
          {product.discountPercent ? <span className="absolute left-4 top-4 rounded-full bg-hooma-accent px-3 py-1.5 text-xs font-bold text-white shadow">−{product.discountPercent}%</span> : null}
          {!product.isOrderable ? <span className="absolute left-4 top-4 rounded-full border border-white/40 bg-white/85 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-hooma-text backdrop-blur">Preview</span> : null}
          <div className="absolute inset-x-4 bottom-4 hidden translate-y-3 items-center justify-between rounded-full bg-hooma-text/88 px-4 py-3 text-xs font-medium text-white opacity-0 backdrop-blur-md transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:flex">
            <span>{language === "ka" ? "პროდუქტის ნახვა" : "View product"}</span>
            <span className="text-hooma-secondary">{language === "ka" ? "გახსნა" : "Open"}</span>
          </div>
        </div>
        <div className={compact ? "p-4" : "p-5"}>
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-hooma-muted">
            <span>{language === "ka" ? product.category : category?.name ?? product.category}</span>
            <span className="flex items-center gap-1.5"><Clock3 size={13} />{product.leadTimeDays} {language === "ka" ? "დღე" : "days"}</span>
          </div>
          <h3 className={`${compact ? "line-clamp-2 min-h-12 text-base" : "text-xl"} font-semibold tracking-tight`}>{language === "ka" ? product.nameKa : product.hoomaName}</h3>
          <div className="mt-2.5"><ProductRatingSummary average={product.ratingAverage} ratingCount={product.ratingCount} salesCount={product.salesCount} language={language} /></div>
          {!compact ? <p className="mt-2 min-h-12 text-sm leading-6 text-hooma-muted">{language === "ka" ? product.shortDescriptionKa : product.shortDescription}</p> : null}
          <div className="mt-5 flex items-center justify-between gap-3 border-t border-hooma-text/10 pt-4 text-sm">
            <span className="flex min-w-0 items-center gap-2">
              <span className="relative inline-flex min-h-9 shrink-0 items-center overflow-hidden rounded-full bg-hooma-accent/10 px-3.5 text-base font-bold text-hooma-accent transition duration-300 group-hover:scale-110 group-hover:bg-hooma-accent group-hover:text-white group-hover:shadow-[0_10px_28px_rgba(207,67,40,0.28)]">
                <span className="absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-white/30 transition-transform duration-700 group-hover:translate-x-[520%]" />
                <span className="relative">{product.price === null ? (language === "ka" ? product.pricePlaceholder : "Price after review") : `₾${product.price.toFixed(2)}`}</span>
              </span>
              {showOriginalPrice ? <span className="shrink-0 text-xs text-hooma-muted line-through">₾{product.originalPrice!.toFixed(2)}</span> : null}
            </span>
            <span className="text-hooma-accent">{language === "ka" ? product.subcategory : subcategory?.name ?? product.subcategory}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
