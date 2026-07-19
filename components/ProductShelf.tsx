"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { ProductCardData } from "@/lib/product-card";
import { ProductCard } from "./ProductCard";
import { useLanguage } from "./LanguageProvider";

export function ProductShelf({ title, titleEn, products, href = "/shop", eyebrow, eyebrowEn }: { title: string; titleEn?: string; products: ProductCardData[]; href?: string; eyebrow?: string; eyebrowEn?: string }) {
  const { language } = useLanguage();
  return (
    <section className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>{eyebrow ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-hooma-accent">{language === "en" ? eyebrowEn ?? eyebrow : eyebrow}</p> : null}<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{language === "en" ? titleEn ?? title : title}</h2></div>
        <Link href={href} className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-hooma-accent hover:underline">{language === "ka" ? "ყველას ნახვა" : "View all"}<ArrowRight size={15} /></Link>
      </div>
      {products.length ? (
        <div className="flex snap-x gap-4 overflow-x-auto pb-2 hide-scrollbar">
          {products.map((product) => <div key={product.id} className="w-[238px] shrink-0 snap-start sm:w-[270px]"><ProductCard product={product} compact /></div>)}
        </div>
      ) : (
        <Link href={href} className="flex min-h-36 items-center justify-center rounded-2xl border border-dashed border-hooma-text/15 bg-hooma-panel/60 px-6 text-center text-sm leading-6 text-hooma-muted transition hover:border-hooma-accent/40 hover:text-hooma-text">
          {language === "ka" ? "ამ კატეგორიის პროდუქტები მალე დაემატება — კატეგორიის ნახვა" : "Products in this category are coming soon — view category"}
        </Link>
      )}
    </section>
  );
}
