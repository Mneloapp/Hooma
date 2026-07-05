"use client";

import Image from "next/image";
import { ArrowDown, Box, Sofa } from "lucide-react";
import { Button } from "./Button";
import { BrandLogo } from "./BrandLogo";
import { useLanguage } from "./LanguageProvider";

export function Hero() {
  const { t } = useLanguage();

  return (
    <section className="relative min-h-[calc(100svh-4rem)] overflow-hidden bg-hooma-text text-white">
      <Image src="/catalog-images/hooma-cotton.jpg" alt={t.hero.alt} fill priority className="hero-kenburns object-cover opacity-75" sizes="100vw" />
      <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-black/20 to-transparent" />
      <div className="absolute bottom-8 right-6 hidden w-72 rounded-3xl border border-white/15 bg-white/10 p-4 backdrop-blur-xl md:block">
        <div className="flex items-center justify-between gap-4 text-xs text-white/65">
          <span>{t.hero.compactBox}</span>
          <span>{t.hero.fullComfort}</span>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white/15">
            <Box size={22} />
          </div>
          <div className="h-px flex-1 origin-left bg-white/60 pulse-line" />
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-white text-hooma-text">
            <Sofa size={24} />
          </div>
        </div>
      </div>
      <div className="relative mx-auto flex min-h-[calc(100svh-4rem)] max-w-7xl items-center px-4 pb-20 pt-16 sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          <BrandLogo inverted className="mb-8 w-28 animate-[fade-slide-up_700ms_ease-out_both]" imageClassName="max-h-24" />
          <p className="mb-5 animate-[fade-slide-up_760ms_ease-out_80ms_both] text-sm font-medium uppercase tracking-[0.28em] text-white/75">{t.hero.label}</p>
          <h1 className="animate-[fade-slide-up_820ms_ease-out_160ms_both] text-5xl font-semibold leading-none md:text-7xl">{t.hero.headline}</h1>
          <p className="mt-6 max-w-lg animate-[fade-slide-up_880ms_ease-out_240ms_both] text-lg leading-8 text-white/78">{t.hero.copy}</p>
          <div className="mt-9 flex animate-[fade-slide-up_940ms_ease-out_320ms_both] flex-wrap gap-3">
            <Button href="/shop">{t.hero.shop}</Button>
            <Button href="/how-it-works" variant="secondary" className="border-white/30 bg-white/10 text-white hover:text-white">{t.hero.howItWorks}</Button>
          </div>
        </div>
      </div>
      <a href="#featured" aria-label="Scroll to featured products" className="absolute bottom-7 left-1/2 hidden -translate-x-1/2 flex-col items-center gap-2 text-xs uppercase tracking-[0.2em] text-white/60 md:flex">
        {t.hero.scroll}
        <ArrowDown size={18} className="float-slow" />
      </a>
    </section>
  );
}
