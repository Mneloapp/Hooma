"use client";

import Link from "next/link";
import { useId } from "react";
import { ArrowRight } from "lucide-react";
import type { ProductCardData } from "@/lib/product-card";
import { useLanguage } from "@/components/LanguageProvider";
import { HomeProductCard } from "@/components/home/HomeProductCard";

export function HomeProductShelf({
  title,
  products,
  href,
  eyebrow,
  showPrice = false,
}: {
  title: string;
  products: ProductCardData[];
  href: string;
  eyebrow?: string;
  showPrice?: boolean;
}) {
  const { language } = useLanguage();
  const headingId = useId();
  const viewAllLabel = language === "ka" ? `${title} — ყველა პროდუქტი` : `View all ${title} products`;

  return (
    <section className="rounded-[1.25rem] border border-hooma-text/10 bg-white/75 p-3 shadow-sm sm:p-4" aria-labelledby={headingId}>
      <div className="mb-3.5 flex items-start justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          {eyebrow ? <p className="mb-1 truncate text-[10px] font-semibold uppercase tracking-[0.16em] text-hooma-accent sm:text-[11px]">{eyebrow}</p> : null}
          <h2 id={headingId} className="line-clamp-2 break-words text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{title}</h2>
        </div>
        <Link
          href={href}
          aria-label={viewAllLabel}
          className="flex shrink-0 items-center gap-1 text-xs font-semibold text-hooma-accent hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent sm:text-sm"
        >
          {language === "ka" ? "ყველა" : "View all"}<ArrowRight size={14} />
        </Link>
      </div>

      {products.length ? (
        <ul className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 hide-scrollbar sm:gap-4">
          {products.map((product) => (
            <li
              key={product.id}
              className="w-[calc((100%_-_12px)/2)] shrink-0 snap-start sm:w-[calc((100%_-_32px)/3)] lg:w-[calc((100%_-_48px)/4)] xl:w-[calc((100%_-_80px)/6)]"
            >
              <HomeProductCard product={product} showPrice={showPrice} />
            </li>
          ))}
        </ul>
      ) : (
        <Link href={href} className="flex min-h-28 items-center justify-center rounded-2xl border border-dashed border-hooma-text/15 bg-hooma-panel/60 px-5 text-center text-sm leading-6 text-hooma-muted transition hover:border-hooma-accent/40 hover:text-hooma-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent">
          {language === "ka" ? "ამ კატეგორიის პროდუქტები მალე დაემატება — კატეგორიის ნახვა" : "Products in this category are coming soon — view category"}
        </Link>
      )}
    </section>
  );
}
