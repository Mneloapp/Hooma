"use client";

import { ArrowDown, Box, CheckCircle2, Clock3, MapPin } from "lucide-react";
import { Button } from "./Button";
import { useLanguage } from "./LanguageProvider";

export function Hero() {
  const { language, t } = useLanguage();

  return (
    <section className="relative overflow-hidden border-b border-hooma-text/10 bg-[#e9eee5]">
      <div className="pointer-events-none absolute -right-28 -top-36 h-[34rem] w-[34rem] rounded-full border-[90px] border-white/50" />
      <div className="pointer-events-none absolute -bottom-56 left-[38%] h-[34rem] w-[34rem] rounded-full bg-[#cbd8c3] blur-3xl" />
      <div className="relative mx-auto grid min-h-[calc(100svh-4rem)] max-w-7xl items-center gap-14 px-4 py-16 sm:px-6 lg:grid-cols-[1.04fr_0.96fr] lg:px-8">
        <div className="max-w-3xl">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-hooma-text/10 bg-white/60 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-hooma-accent backdrop-blur">
            <span className="h-2 w-2 rounded-full bg-hooma-accent" />
            {t.hero.label}
          </div>
          <h1 className="max-w-3xl text-5xl font-semibold leading-[0.98] tracking-[-0.045em] sm:text-6xl lg:text-[5.6rem]">
            {t.hero.headline}
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-8 text-hooma-muted sm:text-xl">{t.hero.copy}</p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button href="/shop">{t.hero.shop}</Button>
            <Button href="/shop?category=custom-parts" variant="secondary">{t.hero.custom}</Button>
          </div>
          <div className="mt-10 grid gap-3 text-sm text-hooma-muted sm:grid-cols-3">
            {[
              [Clock3, t.hero.promise],
              [MapPin, t.hero.local],
              [CheckCircle2, t.hero.tracked],
            ].map(([Icon, label]) => {
              const HeroIcon = Icon as typeof Clock3;
              return (
                <div key={String(label)} className="flex items-center gap-2.5">
                  <HeroIcon size={17} className="shrink-0 text-hooma-accent" />
                  <span>{String(label)}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="relative mx-auto aspect-square w-full max-w-[34rem]">
          <div className="absolute inset-[8%] rounded-[32%] bg-hooma-text shadow-[0_45px_100px_rgba(23,23,23,0.2)]" />
          <div className="absolute inset-[15%] rotate-6 rounded-[28%] border border-white/10 bg-gradient-to-br from-[#394035] to-[#171a16]" />
          <div className="absolute left-[23%] top-[19%] h-[50%] w-[54%] rounded-[4rem] border-[18px] border-[#d8e2d1] bg-transparent shadow-inner" />
          <div className="absolute bottom-[17%] left-[18%] right-[18%] rounded-[2rem] border border-white/10 bg-white/10 p-5 text-white backdrop-blur-xl">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">{language === "ka" ? "Hooma-ს წარმოება" : "Hooma production"}</p>
                <p className="mt-2 text-lg font-medium">{language === "ka" ? "დამზადებული შენი შეკვეთისთვის" : "Made for your order"}</p>
              </div>
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-hooma-text"><Box size={21} /></div>
            </div>
            <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full w-3/4 rounded-full bg-[#c8d8bd]" /></div>
            <div className="mt-3 flex items-center justify-between text-xs text-white/55"><span>{language === "ka" ? "დიზაინი" : "Design"}</span><span>{language === "ka" ? "დამზადება" : "Make"}</span><span>{language === "ka" ? "შემოწმება" : "Check"}</span><span>{language === "ka" ? "მიწოდება" : "Deliver"}</span></div>
          </div>
        </div>
      </div>
      <a href="#categories" aria-label="Scroll to categories" className="absolute bottom-6 left-1/2 hidden -translate-x-1/2 text-hooma-muted md:block">
        <ArrowDown size={20} className="float-slow" />
      </a>
    </section>
  );
}
