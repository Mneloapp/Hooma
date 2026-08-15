"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "@/components/LanguageProvider";
import { categoryPath } from "@/lib/seo";

type CategoryPoster = {
  slug: string;
  image: string;
  titleKa: string;
  titleEn: string;
};

const HERO_IMAGE_WIDTH = 1774;
const HERO_IMAGE_HEIGHT = 887;

const categoryPosters: CategoryPoster[] = [
  {
    slug: "household",
    image: "/homepage/household-category-hero.webp",
    titleKa: "საყოფაცხოვრებო ნივთები ყოველდღიური ცხოვრებისთვის",
    titleEn: "Household objects for everyday life",
  },
  {
    slug: "art",
    image: "/homepage/art-category-hero.webp",
    titleKa: "ხელოვნება შენი სივრცის გასაცოცხლებლად",
    titleEn: "Art to bring your space to life",
  },
  {
    slug: "education",
    image: "/homepage/education-category-hero.webp",
    titleKa: "სასწავლო მოდელები აღმოჩენისა და სწავლისთვის",
    titleEn: "Learning models for discovery and understanding",
  },
  {
    slug: "fashion",
    image: "/homepage/fashion-category-hero.webp",
    titleKa: "აქსესუარები გამორჩეული სტილისთვის",
    titleEn: "Accessories for a distinctive style",
  },
  {
    slug: "hobbies-diy",
    image: "/homepage/hobbies-diy-category-hero.webp",
    titleKa: "ჰობისა და DIY იდეების გასაცოცხლებლად",
    titleEn: "Bring hobby and DIY ideas to life",
  },
  {
    slug: "miniatures",
    image: "/homepage/miniatures-category-hero.webp",
    titleKa: "მინიატიურები დიდი ისტორიებისთვის",
    titleEn: "Miniatures for big stories",
  },
  {
    slug: "props-cosplay",
    image: "/homepage/props-cosplay-category-hero.webp",
    titleKa: "რეკვიზიტები შენი პერსონაჟის გასაცოცხლებლად",
    titleEn: "Props that bring your character to life",
  },
  {
    slug: "tools",
    image: "/homepage/tools-category-hero.webp",
    titleKa: "პრაქტიკული ხელსაწყოები საქმის გასამარტივებლად",
    titleEn: "Practical tools to make every task easier",
  },
  {
    slug: "toys-games",
    image: "/homepage/toys-games-category-hero.webp",
    titleKa: "სათამაშოები მეტი ფანტაზიისა და გართობისთვის",
    titleEn: "Toys and games for imaginative play",
  },
  {
    slug: "generative-3d-model",
    image: "/homepage/generative-3d-model-category-hero.webp",
    titleKa: "გენერაციული 3D ფორმები უნიკალური სივრცისთვის",
    titleEn: "Generative 3D forms for a unique space",
  },
  {
    slug: "3d-printer",
    image: "/homepage/3d-printer-category-hero.webp",
    titleKa: "3D პრინტერის აქსესუარები უკეთესი ბეჭდვისთვის",
    titleEn: "3D printer accessories for better printing",
  },
];

export function HomeCategoryHero() {
  const { language } = useLanguage();
  const carouselId = useId();
  const trackRef = useRef<HTMLUListElement>(null);
  const activeIndexRef = useRef(0);
  const requestedIndexRef = useRef<number | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const georgian = language === "ka";
  const activePoster = categoryPosters[activeIndex] ?? categoryPosters[0];
  const activeTitle = georgian ? activePoster.titleKa : activePoster.titleEn;

  const scrollToPoster = useCallback((index: number) => {
    const track = trackRef.current;
    if (!track) return;

    const nextIndex = Math.max(0, Math.min(categoryPosters.length - 1, index));
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    requestedIndexRef.current = nextIndex;
    track.scrollTo({
      left: nextIndex * track.clientWidth,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, []);

  const moveByPoster = useCallback((direction: -1 | 1) => {
    const currentIndex = requestedIndexRef.current ?? activeIndexRef.current;
    scrollToPoster(currentIndex + direction);
  }, [scrollToPoster]);

  const updateActivePoster = useCallback(() => {
    const track = trackRef.current;
    if (!track || track.clientWidth === 0) return;

    const nextIndex = Math.max(
      0,
      Math.min(categoryPosters.length - 1, Math.round(track.scrollLeft / track.clientWidth)),
    );
    activeIndexRef.current = nextIndex;
    setActiveIndex(nextIndex);

    const requestedIndex = requestedIndexRef.current;
    if (
      requestedIndex !== null
      && Math.abs(track.scrollLeft - requestedIndex * track.clientWidth) < 2
    ) {
      requestedIndexRef.current = null;
    }
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track || typeof ResizeObserver === "undefined") return;

    let previousWidth = track.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = track.clientWidth;
      if (nextWidth === 0 || nextWidth === previousWidth) return;

      previousWidth = nextWidth;
      requestedIndexRef.current = null;
      track.scrollTo({
        left: activeIndexRef.current * nextWidth,
        behavior: "auto",
      });
    });

    observer.observe(track);
    return () => observer.disconnect();
  }, []);

  return (
    <section
      aria-label={georgian ? "პროდუქტების კატეგორიები" : "Product categories"}
      aria-roledescription={georgian ? "კარუსელი" : "carousel"}
      className="relative bg-[#111622]"
    >
      <h1 className="sr-only">
        {georgian ? "Hooma — 3D-დაბეჭდილი პროდუქტები" : "Hooma — 3D-printed products"}
      </h1>
      <ul
        id={carouselId}
        ref={trackRef}
        onScroll={updateActivePoster}
        onPointerDown={() => { requestedIndexRef.current = null; }}
        onWheel={() => { requestedIndexRef.current = null; }}
        className="hide-scrollbar flex snap-x snap-mandatory overflow-x-auto"
      >
        {categoryPosters.map((poster, index) => {
          const title = georgian ? poster.titleKa : poster.titleEn;
          const isInitialPoster = index === 0;

          return (
            <li
              key={poster.slug}
              aria-label={`${index + 1} / ${categoryPosters.length}`}
              aria-roledescription={georgian ? "სლაიდი" : "slide"}
              aria-hidden={index !== activeIndex}
              className="w-full shrink-0 snap-center"
            >
              <Link
                href={categoryPath(poster.slug)}
                aria-label={title}
                tabIndex={index === activeIndex ? 0 : -1}
                className="group relative block h-[380px] overflow-hidden bg-[#111622] text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-hooma-secondary sm:h-[420px] lg:h-[480px]"
              >
                {/* Global image unoptimization strips `sizes` from next/image output. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={poster.image}
                  alt=""
                  width={HERO_IMAGE_WIDTH}
                  height={HERO_IMAGE_HEIGHT}
                  sizes="100vw"
                  loading={isInitialPoster ? "eager" : "lazy"}
                  fetchPriority={isInitialPoster ? "high" : "auto"}
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover object-[45%_center] transition duration-700 group-hover:scale-[1.015] sm:object-center xl:object-contain xl:object-right"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-r from-[#0d1929]/95 via-[#0d1929]/80 to-[#0d1929]/50 sm:via-[#0d1929]/75 sm:to-[#0d1929]/5"
                />
                <span
                  aria-hidden="true"
                  className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#FFF1EA] via-[#FFF1EA]/35 to-transparent"
                />

                <div className="relative mx-auto flex h-full max-w-[1480px] items-center px-6 pb-12 sm:px-10 sm:pb-16 lg:px-14">
                  <div className="max-w-[19rem] sm:max-w-[38rem]">
                    <h2 className="text-3xl font-semibold leading-[1.08] tracking-tight text-white sm:text-4xl lg:text-5xl">
                      {title}
                    </h2>
                    <span
                      aria-hidden="true"
                      className="mt-6 hidden size-11 items-center justify-center rounded-full bg-white text-hooma-text shadow-lg transition group-hover:bg-hooma-secondary group-focus-visible:bg-hooma-secondary sm:inline-flex"
                    >
                      <ArrowRight size={18} />
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          );
        })}
      </ul>

      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {activeTitle} — {activeIndex + 1} / {categoryPosters.length}
      </span>

      <div className="pointer-events-none absolute inset-x-0 bottom-14 z-20 mx-auto flex max-w-[1480px] items-center justify-between px-4 sm:bottom-16 sm:px-6 lg:px-8">
        <div className="pointer-events-auto flex gap-2">
          <button
            type="button"
            onClick={() => moveByPoster(-1)}
            disabled={activeIndex === 0}
            aria-controls={carouselId}
            aria-label={georgian ? "წინა კატეგორია" : "Previous category"}
            className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-[#111622]/75 text-white shadow-lg backdrop-blur transition hover:bg-[#111622] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-secondary disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => moveByPoster(1)}
            disabled={activeIndex === categoryPosters.length - 1}
            aria-controls={carouselId}
            aria-label={georgian ? "შემდეგი კატეგორია" : "Next category"}
            className="inline-flex size-11 items-center justify-center rounded-full border border-white/20 bg-[#111622]/75 text-white shadow-lg backdrop-blur transition hover:bg-[#111622] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-secondary disabled:cursor-not-allowed disabled:opacity-35"
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>

        <div
          aria-hidden="true"
          className="pointer-events-auto rounded-full bg-[#111622]/70 px-3 py-2 text-xs font-semibold tabular-nums text-white shadow-lg backdrop-blur sm:hidden"
        >
          {activeIndex + 1} / {categoryPosters.length}
        </div>

        <div className="pointer-events-auto hidden items-center rounded-full bg-[#111622]/70 px-2 py-1 shadow-lg backdrop-blur sm:flex">
          {categoryPosters.map((poster, index) => (
            <button
              key={poster.slug}
              type="button"
              onClick={() => scrollToPoster(index)}
              aria-controls={carouselId}
              aria-current={index === activeIndex ? "true" : undefined}
              aria-label={
                georgian
                  ? `${poster.titleKa} — სლაიდზე გადასვლა`
                  : `Go to ${poster.titleEn}`
              }
              className="inline-flex size-6 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hooma-secondary"
            >
              <span
                aria-hidden="true"
                className={`h-2 rounded-full transition-all ${
                  index === activeIndex ? "w-4 bg-hooma-secondary" : "w-2 bg-white/45 hover:bg-white/75"
                }`}
              />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
