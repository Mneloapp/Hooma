"use client";

import Link from "next/link";
import { ArrowRight, Check, ClipboardCheck, PackageCheck, Printer } from "lucide-react";
import { catalogCategories } from "@/data/catalog";
import { featuredProducts } from "@/data/products";
import { Button } from "@/components/Button";
import { FAQAccordion } from "@/components/FAQAccordion";
import { Hero } from "@/components/Hero";
import { ProductGrid } from "@/components/ProductGrid";
import { Reveal } from "@/components/Reveal";
import { SectionTitle } from "@/components/SectionTitle";
import { useLanguage } from "@/components/LanguageProvider";

export default function Home() {
  const { t, language } = useLanguage();
  const steps = language === "ka"
    ? [
        ["01", "აირჩიე", "იპოვე პროდუქტი კატეგორიიდან ან მოგვწერე ინდივიდუალური დეტალის შესახებ.", ClipboardCheck],
        ["02", "ვამზადებთ", "ოპერატორი ამოწმებს შეკვეთას და პროდუქტი გადადის წარმოების რიგში.", Printer],
        ["03", "მიიღე", "ხარისხის კონტროლის შემდეგ შეკვეთა გადაეცემა მიწოდებას.", PackageCheck],
      ]
    : [
        ["01", "Choose", "Find a product by category or send us a custom-part request.", ClipboardCheck],
        ["02", "We make it", "An operator checks the order and moves it into the production queue.", Printer],
        ["03", "Receive", "After quality control, the order is handed to delivery.", PackageCheck],
      ];

  return (
    <>
      <Hero />

      <section id="categories" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal><SectionTitle eyebrow={t.home.categoriesEyebrow} title={t.home.categoriesTitle} /></Reveal>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {catalogCategories.map((category, index) => (
            <Reveal key={category.slug} delay={(index % 4) * 60}>
              <Link href={`/shop?category=${category.slug}`} className="group flex min-h-64 flex-col rounded-[1.75rem] border border-hooma-text/10 bg-white/70 p-6 transition duration-300 hover:-translate-y-1 hover:border-hooma-accent/40 hover:shadow-soft">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-hooma-panel text-hooma-accent transition group-hover:bg-hooma-accent group-hover:text-white"><category.icon size={22} /></div>
                <h3 className="mt-8 text-2xl font-semibold tracking-tight">{language === "ka" ? category.nameKa : category.name}</h3>
                <p className="mt-3 line-clamp-2 text-sm leading-6 text-hooma-muted">{category.description}</p>
                <div className="mt-auto flex items-center justify-between pt-6 text-sm font-medium text-hooma-accent">
                  <span>{category.subcategories.length} {language === "ka" ? "ქვეკატეგორია" : "subcategories"}</span>
                  <ArrowRight size={17} className="transition group-hover:translate-x-1" />
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <section id="featured" className="border-y border-hooma-text/10 bg-white/45 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Reveal><SectionTitle eyebrow={t.home.featuredEyebrow} title={t.home.featuredTitle} copy={language === "ka" ? "ეს არის კატალოგის სტრუქტურის სატესტო პროდუქტები. რეალური ფოტო, ფასი და წარმოების პროფილი ადმინ პანელიდან დამტკიცდება." : "These are preview products for the catalog structure. Final media, price, and production profiles will be approved in admin."} /></Reveal>
          <ProductGrid products={featuredProducts.slice(0, 6)} />
          <div className="mt-10 text-center"><Button href="/shop" variant="secondary">{language === "ka" ? "მთელი კატალოგი" : "View full catalog"}<ArrowRight size={16} className="ml-2" /></Button></div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal>
          <div className="grid gap-8 rounded-[2rem] bg-hooma-text p-7 text-white md:p-10 lg:grid-cols-[0.9fr_1.1fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/45">{t.home.howEyebrow}</p>
              <h2 className="mt-4 max-w-xl text-4xl font-semibold tracking-tight md:text-5xl">{t.home.howTitle}</h2>
              <p className="mt-5 max-w-lg text-sm leading-7 text-white/62">{t.home.howCopy}</p>
              <Button href="/how-it-works" variant="secondary" className="mt-8 border-white/20 bg-white/10 text-white hover:text-white">{t.home.howCta}</Button>
            </div>
            <div className="grid gap-3">
              {steps.map(([number, title, copy, Icon]) => {
                const StepIcon = Icon as typeof ClipboardCheck;
                return (
                  <div key={String(number)} className="grid gap-4 rounded-2xl border border-white/10 bg-white/[0.06] p-5 sm:grid-cols-[48px_1fr_40px] sm:items-center">
                    <span className="text-sm font-semibold text-[#c8d8bd]">{String(number)}</span>
                    <div><h3 className="font-semibold">{String(title)}</h3><p className="mt-1 text-sm leading-6 text-white/55">{String(copy)}</p></div>
                    <StepIcon size={20} className="text-white/35" />
                  </div>
                );
              })}
            </div>
          </div>
        </Reveal>
      </section>

      <section className="bg-hooma-panel py-20">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-2 lg:px-8">
          <Reveal className="relative min-h-[420px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#ccd9c5] to-[#e8ded0] p-8">
            <div className="absolute -right-10 -top-10 h-72 w-72 rounded-full border-[55px] border-white/35" />
            <div className="absolute bottom-10 left-10 right-10 rounded-[2rem] bg-hooma-text p-7 text-white shadow-soft">
              <p className="text-xs uppercase tracking-[0.22em] text-white/45">Customer experience</p>
              <p className="mt-4 text-3xl font-semibold">Order → Make → Check → Deliver</p>
              <div className="mt-6 grid grid-cols-4 gap-2">{["Order", "Make", "Check", "Deliver"].map((item, index) => <div key={item} className="text-center"><div className={`mx-auto h-2 w-2 rounded-full ${index < 3 ? "bg-[#c8d8bd]" : "bg-white/20"}`} /><p className="mt-2 text-[10px] text-white/45">{item}</p></div>)}</div>
            </div>
          </Reveal>
          <Reveal delay={120} className="flex flex-col justify-center">
            <p className="text-sm font-medium uppercase tracking-[0.24em] text-hooma-accent">{t.home.whyEyebrow}</p>
            <h2 className="mt-4 text-4xl font-semibold tracking-tight md:text-5xl">{t.home.whyTitle}</h2>
            <div className="mt-8 grid gap-4">
              {t.home.reasons.map((reason) => <div key={reason} className="flex items-center gap-3 text-hooma-muted"><span className="grid h-7 w-7 place-items-center rounded-full bg-hooma-accent text-white"><Check size={15} /></span>{reason}</div>)}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 py-20 sm:px-6 lg:px-8">
        <Reveal>
          <SectionTitle eyebrow={t.home.faqEyebrow} title={t.home.faqTitle} />
          <FAQAccordion />
          <div className="mt-8 text-center"><Button href="/faq" variant="secondary">{t.home.faqCta}<ArrowRight size={16} className="ml-2" /></Button></div>
        </Reveal>
      </section>
    </>
  );
}
