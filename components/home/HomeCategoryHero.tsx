"use client";

import Image from "next/image";
import Link from "next/link";
import { useId } from "react";
import { ArrowRight } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";

const featuredCategoryHref = "/shop?category=household";

export function HomeCategoryHero() {
  const { language } = useLanguage();
  const headingId = useId();
  const georgian = language === "ka";

  return (
    <section aria-labelledby={headingId}>
      <Link
        href={featuredCategoryHref}
        aria-label={georgian ? "საყოფაცხოვრებო პროდუქტების ნახვა" : "Shop Household products"}
        className="group relative block h-[380px] overflow-hidden bg-[#111622] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hooma-secondary sm:h-[420px] lg:h-[480px]"
      >
        <Image
          src="/homepage/household-category-hero.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[45%_center] transition duration-700 group-hover:scale-[1.015] sm:object-center xl:object-contain xl:object-right"
        />
        <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#0d1929]/95 via-[#0d1929]/80 to-[#0d1929]/50 sm:via-[#0d1929]/75 sm:to-[#0d1929]/5" />
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#FFF1EA] via-[#FFF1EA]/35 to-transparent" />

        <div className="relative mx-auto flex h-full max-w-[1480px] items-center px-6 pb-12 sm:px-10 sm:pb-16 lg:px-14">
          <div className="max-w-[19rem] sm:max-w-[36rem]">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-hooma-secondary sm:text-xs">
              {georgian ? "რჩეული კატეგორია" : "Featured category"}
            </p>
            <h1 id={headingId} className="mt-3 text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">
              {georgian ? "საყოფაცხოვრებო ნივთები ყოველდღიური სივრცისთვის" : "Household objects for everyday spaces"}
            </h1>
            <p className="mt-4 max-w-lg text-sm leading-6 text-white/70 sm:text-base sm:leading-7">
              {georgian
                ? "დეკორი და პრაქტიკული ნივთები სახლისთვის — თითოეული მზადდება შენი შეკვეთისთვის."
                : "Décor and practical objects for home — each made to order for you."}
            </p>
            <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-semibold text-hooma-text shadow-lg transition group-hover:bg-hooma-secondary group-focus-visible:bg-hooma-secondary">
              {georgian ? "საყოფაცხოვრებო პროდუქტების ნახვა" : "Shop Household"}
              <ArrowRight size={16} aria-hidden="true" />
            </span>
          </div>
        </div>
      </Link>
    </section>
  );
}
