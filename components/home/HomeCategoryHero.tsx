"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { ArrowRight } from "lucide-react";
import type { ProductCardData } from "@/lib/product-card";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/components/LanguageProvider";

const featuredCategoryHref = "/shop?category=household";
const heroImageSizes = "(min-width: 768px) 32vw, 72vw";

function tileClass(index: number, count: number) {
  if (count <= 1) return "col-span-12 row-span-6";
  if (count === 2) return index === 0 ? "col-span-7 row-span-6" : "col-span-5 row-span-6";
  return index === 0 ? "col-span-7 row-span-6" : "col-span-5 row-span-3";
}

export function HomeCategoryHero({ products }: { products: ProductCardData[] }) {
  const { language } = useLanguage();
  const headingId = useId();
  const posterProducts = products.slice(0, 2);
  const georgian = language === "ka";

  return (
    <section aria-labelledby={headingId}>
      <Link
        href={featuredCategoryHref}
        className="group relative isolate block overflow-hidden rounded-[1.5rem] bg-[#18243b] text-white shadow-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-accent focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="absolute -left-24 -top-36 h-80 w-80 rounded-full bg-[#ff9b78]/25 blur-3xl" />
        <span aria-hidden="true" className="absolute -bottom-40 right-12 h-96 w-96 rounded-full bg-[#83c9c7]/25 blur-3xl" />

        <div className="relative grid md:min-h-[350px] md:grid-cols-[minmax(0,0.78fr)_minmax(0,1.22fr)] md:items-stretch">
          <div className="flex flex-col justify-center px-6 pb-4 pt-7 sm:px-8 sm:pb-5 sm:pt-9 md:px-10 md:py-10 lg:px-12">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-hooma-secondary sm:text-xs">
              {georgian ? "რჩეული კატეგორია" : "Featured category"}
            </p>
            <h1 id={headingId} className="mt-3 max-w-xl text-3xl font-semibold leading-[1.08] tracking-tight sm:text-4xl lg:text-5xl">
              {georgian ? "საყოფაცხოვრებო ნივთები ყოველდღიური სივრცისთვის" : "Household objects for everyday spaces"}
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
              {georgian
                ? "დეკორი და პრაქტიკული ნივთები სახლისთვის — თითოეული მზადდება შენს შეკვეთაზე."
                : "Décor and practical objects for home — each made for your order."}
            </p>
            <span className="mt-6 inline-flex w-fit items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-hooma-text transition group-hover:bg-hooma-secondary group-focus-visible:bg-hooma-secondary">
              {georgian ? "საყოფაცხოვრებო პროდუქტების ნახვა" : "Shop Household"}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </div>

          <div aria-hidden="true" className="grid min-h-[215px] grid-cols-12 grid-rows-6 gap-3 px-5 pb-5 pt-1 sm:min-h-[270px] sm:px-8 sm:pb-8 md:min-h-0 md:py-7 md:pl-0 md:pr-8">
            {posterProducts.length ? posterProducts.map((product, index) => (
              <div
                key={product.id}
                className={cn(
                  "relative overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-2xl transition duration-500 group-hover:-translate-y-1",
                  tileClass(index, posterProducts.length),
                )}
              >
                <Image
                  src={product.heroImage}
                  alt=""
                  fill
                  className="object-cover transition duration-700 group-hover:scale-[1.035]"
                  sizes={heroImageSizes}
                  priority={index === 0}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-white/5" />
              </div>
            )) : (
              <div className="relative col-span-12 row-span-6 overflow-hidden rounded-2xl border border-white/15 bg-white/10 shadow-2xl">
                <Image
                  src="/catalog-placeholders/home.svg"
                  alt=""
                  fill
                  className="object-cover"
                  sizes={heroImageSizes}
                />
              </div>
            )}
          </div>
        </div>
      </Link>
    </section>
  );
}
