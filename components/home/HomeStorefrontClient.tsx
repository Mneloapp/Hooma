"use client";

import { ArrowRight, BadgePercent, Clock3, MapPin, PackageCheck, Printer, ShieldCheck } from "lucide-react";
import { catalogCategories } from "@/data/catalog";
import type { Product } from "@/data/products";
import { Button } from "@/components/Button";
import { ProductShelf } from "@/components/ProductShelf";
import { useLanguage } from "@/components/LanguageProvider";

export function HomeStorefrontClient({ catalogProducts, dailyDealDiscountPercent }: { catalogProducts: Product[]; dailyDealDiscountPercent: number }) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const popularProducts = [...catalogProducts]
    .sort((left, right) => right.popularityScore - left.popularityScore || right.salesCount - left.salesCount || right.ratingAverage - left.ratingAverage)
    .slice(0, 12);

  return (
    <main className="bg-hooma-panel/60 pb-16">
      <div className="mx-auto max-w-[1480px] space-y-5 px-4 pt-5 sm:px-6 lg:px-8">
        <section className="grid overflow-hidden rounded-[1.25rem] border border-hooma-text/10 bg-hooma-text text-white md:grid-cols-[1fr_auto] md:items-center">
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 text-[#c8d8bd]"><BadgePercent size={22} /><p className="text-xs font-semibold uppercase tracking-[0.18em]">{georgian ? "Hooma-ს დღის შეთავაზებები" : "Hooma daily deals"}</p></div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">{georgian ? `50 განსხვავებული პროდუქტი ყოველდღე −${dailyDealDiscountPercent}%-ად` : `50 different products at ${dailyDealDiscountPercent}% off every day`}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{georgian ? "შეთავაზებები თბილისის დროით ყოველ დღე იცვლება. ფასდაკლება მოქმედებს მხოლოდ იმ დღის შერჩეულ პროდუქტებზე." : "Deals rotate every day on Tbilisi time and apply only to that day’s selected products."}</p>
          </div>
          <div className="border-t border-white/10 p-6 md:border-l md:border-t-0 md:p-8"><Button href="/deals" variant="secondary" className="border-white/15 bg-white text-hooma-text">{georgian ? "დღის შეთავაზებების ნახვა" : "See today’s deals"}<ArrowRight size={15} className="ml-2" /></Button></div>
        </section>

        <section className="grid overflow-hidden rounded-[1.25rem] border border-hooma-text/10 bg-gradient-to-r from-[#dbe6d5] via-[#f0efe8] to-[#e7d9ca] sm:grid-cols-3">
          {[
            [Clock3, georgian ? "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე" : "3 business days from order to delivery", georgian ? "სტანდარტული კატალოგის შეკვეთებისთვის" : "For standard catalog orders"],
            [MapPin, georgian ? "დამზადებულია თბილისში" : "Made in Tbilisi", georgian ? "ადგილობრივი წარმოება" : "Local production"],
            [ShieldCheck, georgian ? "შემოწმებული ოპერატორის მიერ" : "Operator checked", georgian ? "ხარისხის კონტროლი ყველა შეკვეთაზე" : "Quality control on every order"],
          ].map(([Icon, title, copy], index) => { const InfoIcon = Icon as typeof Clock3; return <div key={String(title)} className={`flex items-center gap-3 px-5 py-4 ${index ? "border-t border-hooma-text/10 sm:border-l sm:border-t-0" : ""}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/70 text-hooma-accent"><InfoIcon size={18} /></span><div><h2 className="text-sm font-semibold">{String(title)}</h2><p className="mt-0.5 text-xs text-hooma-muted">{String(copy)}</p></div></div>; })}
        </section>

        <ProductShelf eyebrow={georgian ? "ახლა პოპულარულია" : "Popular now"} title={georgian ? "პოპულარული პროდუქტები" : "Popular products"} products={popularProducts} />

        <section className="grid gap-5 rounded-[1.25rem] bg-hooma-text p-6 text-white md:grid-cols-[1fr_auto] md:items-center lg:p-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c8d8bd]">{georgian ? "ინდივიდუალურად დამზადებული Hooma-სგან" : "Custom made by Hooma"}</p><h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{georgian ? "ვერ იპოვე საჭირო დეტალი? დაგიმზადებთ." : "Can’t find the part you need? We’ll make it."}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{georgian ? "გამოგვიგზავნე ფოტო, ზომები ან არსებული მოდელი — ოპერატორი შეაფასებს დამზადების შესაძლებლობას და ვადას." : "Send a photo, dimensions, or an existing model and our operator will review feasibility and timing."}</p></div>
          <Button href="/account/custom-orders" variant="secondary" className="border-white/15 bg-white text-hooma-text">{georgian ? "ინდივიდუალური შეკვეთა" : "Request a custom part"}<ArrowRight size={15} className="ml-2" /></Button>
        </section>

        <div className="space-y-5">
          {catalogCategories.map((category) => (
            <ProductShelf key={category.slug} eyebrow={georgian ? "კატეგორია" : "Category"} title={georgian ? category.nameKa : category.name} products={catalogProducts.filter((item) => item.categorySlug === category.slug)} href={`/shop?category=${category.slug}`} />
          ))}
        </div>

        <section className="grid gap-5 rounded-[1.25rem] bg-white/80 p-6 shadow-sm lg:grid-cols-[0.9fr_1.1fr] lg:p-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-accent">{georgian ? "Hooma-ს შეკვეთის პროცესი" : "Hooma order flow"}</p><h2 className="mt-3 text-3xl font-semibold tracking-tight">{georgian ? "აირჩიე, შეუკვეთე, მიიღე" : "Choose, order, receive"}</h2><p className="mt-4 max-w-xl text-sm leading-7 text-hooma-muted">{georgian ? "წარმოება იწყება მხოლოდ ოპერატორის დადასტურების შემდეგ. თითოეული ეტაპის სტატუსს შენს ანგარიშში ნახავ." : "Production starts only after operator confirmation. Follow every stage from your account."}</p><Button href="/how-it-works" variant="secondary" className="mt-6">{georgian ? "როგორ შევუკვეთოთ?" : "How to order"}</Button></div>
          <div className="grid gap-3 sm:grid-cols-2">
            {(georgian
              ? [[PackageCheck, "1. შეკვეთა", "აირჩიე პროდუქტი, ფერი და მასალა"], [ShieldCheck, "2. დადასტურება", "ოპერატორი ამოწმებს კონფიგურაციას"], [Printer, "3. დამზადება", "პროდუქტი იბეჭდება შეკვეთისთვის"], [MapPin, "4. მიწოდება", "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე"]]
              : [[PackageCheck, "1. Order", "Choose a product, color, and material"], [ShieldCheck, "2. Confirmation", "An operator checks the configuration"], [Printer, "3. Production", "The product is made for your order"], [MapPin, "4. Delivery", "3 business days from order to delivery"]]
            ).map(([Icon, title, copy]) => { const StepIcon = Icon as typeof Printer; return <div key={String(title)} className="rounded-xl bg-hooma-panel p-4"><StepIcon size={18} className="text-hooma-accent" /><h3 className="mt-3 text-sm font-semibold">{String(title)}</h3><p className="mt-1 text-xs leading-5 text-hooma-muted">{String(copy)}</p></div>; })}
          </div>
        </section>
      </div>
    </main>
  );
}
