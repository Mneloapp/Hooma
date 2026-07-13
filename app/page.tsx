"use client";

import Link from "next/link";
import { ArrowRight, Clock3, MapPin, PackageCheck, Printer, ShieldCheck } from "lucide-react";
import { catalogCategories } from "@/data/catalog";
import { products } from "@/data/products";
import { Button } from "@/components/Button";
import { ProductShelf } from "@/components/ProductShelf";
import { useLanguage } from "@/components/LanguageProvider";

export default function Home() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const deskProducts = products.filter((item) => item.categorySlug === "desk-tech");
  const homeProducts = products.filter((item) => ["home-organization", "kitchen"].includes(item.categorySlug));
  const personalProducts = products.filter((item) => ["pets", "kids-learning", "custom-parts"].includes(item.categorySlug));
  const primaryDepartments = [catalogCategories[0], catalogCategories[1], catalogCategories[2], catalogCategories[7]];
  const secondaryDepartments = [catalogCategories[3], catalogCategories[4], catalogCategories[5], catalogCategories[6]];

  const DepartmentCards = ({ categories }: { categories: typeof catalogCategories }) => (
    <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
      {categories.map((category) => (
        <section key={category.slug} className="flex min-h-[300px] flex-col rounded-[1.25rem] border border-hooma-text/10 bg-white/85 p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-hooma-panel text-hooma-accent"><category.icon size={20} /></span>
            <h2 className="text-lg font-semibold leading-6">{georgian ? category.nameKa : category.name}</h2>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-2.5">
            {category.subcategories.map((subcategory) => (
              <Link key={subcategory.slug} href={`/shop?category=${category.slug}&subcategory=${subcategory.slug}`} className="group flex min-h-20 flex-col justify-between rounded-xl bg-hooma-background p-3 text-xs leading-5 text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text">
                <span>{georgian ? subcategory.nameKa : subcategory.name}</span>
                <ArrowRight size={13} className="mt-2 text-hooma-accent transition group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
          <Link href={`/shop?category=${category.slug}`} className="mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-medium text-hooma-accent hover:underline">{georgian ? "ყველას ნახვა" : "See all"}<ArrowRight size={14} /></Link>
        </section>
      ))}
    </div>
  );

  return (
    <main className="bg-hooma-panel/60 pb-16">
      <div className="mx-auto max-w-[1480px] space-y-5 px-4 pt-5 sm:px-6 lg:px-8">
        <div id="deals" className="scroll-mt-32">
          <ProductShelf eyebrow="3D printed in Tbilisi" title={georgian ? "დღის შეთავაზებები" : "Today’s picks"} products={products.slice(0, 7)} href="/shop" />
        </div>

        <section className="grid overflow-hidden rounded-[1.25rem] border border-hooma-text/10 bg-gradient-to-r from-[#dbe6d5] via-[#f0efe8] to-[#e7d9ca] sm:grid-cols-3">
          {[
            [Clock3, georgian ? "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე" : "3 business days from order to delivery", georgian ? "სტანდარტული კატალოგის შეკვეთებისთვის" : "For standard catalog orders"],
            [MapPin, georgian ? "დამზადებულია თბილისში" : "Made in Tbilisi", georgian ? "ადგილობრივი წარმოება" : "Local production"],
            [ShieldCheck, georgian ? "შემოწმებული ოპერატორის მიერ" : "Operator checked", georgian ? "ხარისხის კონტროლი ყველა შეკვეთაზე" : "Quality control on every order"],
          ].map(([Icon, title, copy], index) => { const InfoIcon = Icon as typeof Clock3; return <div key={String(title)} className={`flex items-center gap-3 px-5 py-4 ${index ? "border-t border-hooma-text/10 sm:border-l sm:border-t-0" : ""}`}><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/70 text-hooma-accent"><InfoIcon size={18} /></span><div><h2 className="text-sm font-semibold">{String(title)}</h2><p className="mt-0.5 text-xs text-hooma-muted">{String(copy)}</p></div></div>; })}
        </section>

        <DepartmentCards categories={primaryDepartments} />

        <ProductShelf eyebrow="Popular now" title={georgian ? "პოპულარული პროდუქტები" : "Popular products"} products={products.slice(1)} />

        <section className="grid gap-5 rounded-[1.25rem] bg-hooma-text p-6 text-white md:grid-cols-[1fr_auto] md:items-center lg:p-8">
          <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#c8d8bd]">Custom made by Hooma</p><h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{georgian ? "ვერ იპოვე საჭირო დეტალი? დაგიმზადებთ." : "Can’t find the part you need? We’ll make it."}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-white/60">{georgian ? "გამოგვიგზავნე ფოტო, ზომები ან არსებული მოდელი — ოპერატორი შეაფასებს დამზადების შესაძლებლობას და ვადას." : "Send a photo, dimensions, or an existing model and our operator will review feasibility and timing."}</p></div>
          <Button href="/account/custom-orders" variant="secondary" className="border-white/15 bg-white text-hooma-text">{georgian ? "ინდივიდუალური შეკვეთა" : "Request a custom part"}<ArrowRight size={15} className="ml-2" /></Button>
        </section>

        {deskProducts.length ? <ProductShelf title={georgian ? "სამუშაო სივრცე და ტექნიკა" : "Desk & tech"} products={deskProducts} href="/shop?category=desk-tech" /> : null}

        <DepartmentCards categories={secondaryDepartments} />

        {homeProducts.length ? <ProductShelf title={georgian ? "სახლისა და სამზარეულოსთვის" : "For home & kitchen"} products={homeProducts} href="/shop?category=home-organization" /> : null}

        <section className="grid gap-5 rounded-[1.25rem] bg-white/80 p-6 shadow-sm lg:grid-cols-[0.9fr_1.1fr] lg:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-accent">Hooma order flow</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight">{georgian ? "აირჩიე, შეუკვეთე, მიიღე" : "Choose, order, receive"}</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-hooma-muted">{georgian ? "წარმოება იწყება მხოლოდ ოპერატორის დადასტურების შემდეგ. თითოეული ეტაპის სტატუსს შენს ანგარიშში ნახავ." : "Production starts only after operator confirmation. Follow every stage from your account."}</p>
            <Button href="/how-it-works" variant="secondary" className="mt-6">{georgian ? "როგორ შევუკვეთოთ?" : "How to order"}</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[[PackageCheck, "1. შეკვეთა", "აირჩიე პროდუქტი, ფერი და მასალა"], [ShieldCheck, "2. დადასტურება", "ოპერატორი ამოწმებს კონფიგურაციას"], [Printer, "3. დამზადება", "პროდუქტი იბეჭდება შეკვეთისთვის"], [MapPin, "4. მიწოდება", "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე"]].map(([Icon, title, copy]) => { const StepIcon = Icon as typeof Printer; return <div key={String(title)} className="rounded-xl bg-hooma-panel p-4"><StepIcon size={18} className="text-hooma-accent" /><h3 className="mt-3 text-sm font-semibold">{String(title)}</h3><p className="mt-1 text-xs leading-5 text-hooma-muted">{String(copy)}</p></div>; })}
          </div>
        </section>

        {personalProducts.length ? <ProductShelf title={georgian ? "პერსონალური და ინდივიდუალური" : "Personal & custom"} products={personalProducts} href="/shop?category=custom-parts" /> : null}
      </div>
    </main>
  );
}
