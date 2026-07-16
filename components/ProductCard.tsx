"use client";

import Image from "next/image";
import Link from "next/link";
import { Clock3 } from "lucide-react";
import type { Product } from "@/data/products";
import { useLanguage } from "./LanguageProvider";
import { ProductRatingSummary } from "@/components/reviews/ProductRatingSummary";

export function ProductCard({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { language } = useLanguage();

  return (
    <Link href={product.categorySlug === "custom-parts" ? "/account/custom-orders" : `/product/${product.slug}`} className="group block">
      <div className={`overflow-hidden border border-hooma-text/10 bg-white/75 transition duration-300 group-hover:-translate-y-1 group-hover:shadow-soft ${compact ? "rounded-2xl" : "rounded-[1.5rem]"}`}>
        <div className="relative aspect-[4/3] overflow-hidden bg-hooma-panel">
          <Image src={product.heroImage} alt={language === "ka" ? product.nameKa : product.hoomaName} fill className="object-cover transition duration-700 group-hover:scale-[1.025]" sizes="(min-width: 1024px) 33vw, 100vw" />
          <span className="absolute left-4 top-4 rounded-full border border-white/40 bg-white/80 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-hooma-text backdrop-blur">{product.isOrderable ? "ხელმისაწვდომია" : "Preview"}</span>
          <div className="absolute inset-x-4 bottom-4 hidden translate-y-3 items-center justify-between rounded-full bg-hooma-text/88 px-4 py-3 text-xs font-medium text-white opacity-0 backdrop-blur-md transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 sm:flex">
            <span>{language === "ka" ? "პროდუქტის ნახვა" : "View product"}</span>
            <span className="text-[#c8d8bd]">Open</span>
          </div>
        </div>
        <div className={compact ? "p-4" : "p-5"}>
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-hooma-muted">
            <span>{product.category}</span>
            <span className="flex items-center gap-1.5"><Clock3 size={13} />{product.leadTimeDays} {language === "ka" ? "დღე" : "days"}</span>
          </div>
          <h3 className={`${compact ? "line-clamp-2 min-h-12 text-base" : "text-xl"} font-semibold tracking-tight`}>{language === "ka" ? product.nameKa : product.hoomaName}</h3>
          <div className="mt-2.5"><ProductRatingSummary average={product.ratingAverage} ratingCount={product.ratingCount} salesCount={product.salesCount} language={language} /></div>
          {!compact ? <p className="mt-2 min-h-12 text-sm leading-6 text-hooma-muted">{language === "ka" ? product.shortDescriptionKa : product.shortDescription}</p> : null}
          <div className="mt-5 flex items-center justify-between border-t border-hooma-text/10 pt-4 text-sm">
            <span className="font-semibold">{product.price === null ? product.pricePlaceholder : `₾${product.price.toFixed(2)}`}</span>
            <span className="text-hooma-accent">{product.subcategory}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
