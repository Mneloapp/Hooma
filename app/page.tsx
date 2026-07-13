"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Clock3, MapPin, PackageCheck, Printer, ShieldCheck } from "lucide-react";
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

  return (
    <main className="bg-hooma-panel/60 pb-16">
      <section className="relative overflow-hidden bg-gradient-to-r from-[#dce6d7] via-[#eef1e8] to-[#e5d9ca]">
        <div className="pointer-events-none absolute -right-28 -top-44 h-[30rem] w-[30rem] rounded-full border-[78px] border-white/45" />
        <div className="relative mx-auto grid min-h-[360px] max-w-[1480px] items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:px-8">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-accent">Hooma · made on demand</p>
            <h1 className="mt-4 text-4xl font-semibold leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
              {georgian ? "იპოვე ნივთი, რომელიც შენს ყოველდღიურობას ზუსტად ერგება" : "Find objects made to fit your everyday life"}
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-hooma-muted sm:text-lg">
              {georgian ? "აირჩიე კატალოგიდან, მიუთითე ფერი და მასალა — ჩვენ დავამზადებთ, შევამოწმებთ და მოგაწვდით შეკვეთიდან მესამე სამუშაო დღეს." : "Choose from the catalog, select a color and material, and we will make, check, and deliver your order within three business days."}
            </p>
            <div className="mt-7 flex flex-wrap gap-3"><Button href="/shop">{georgian ? "დაიწყე ყიდვა" : "Start shopping"}</Button><Button href="/shop?category=custom-parts" variant="secondary">{georgian ? "შეუკვეთე დეტალი" : "Request a part"}</Button></div>
          </div>
          <div className="hidden justify-self-end lg:block">
            <div className="grid w-[360px] gap-3 rounded-[2rem] bg-hooma-text p-6 text-white shadow-soft">
              <p className="text-xs uppercase tracking-[0.2em] text-white/45">შეკვეთის გზა</p>
              {["აირჩიე პროდუქტი", "ვამზადებთ თბილისში", "ვამოწმებთ ხარისხს", "გაწვდით მესამე დღეს"].map((item, index) => <div key={item} className="flex items-center gap-4 rounded-xl bg-white/[0.07] p-3"><span className="grid h-8 w-8 place-items-center rounded-full bg-[#c8d8bd] text-xs font-bold text-hooma-text">{index + 1}</span><span className="text-sm">{item}</span></div>)}
            </div>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1480px] space-y-6 px-4 pt-6 sm:px-6 lg:px-8">
        <section id="categories" className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-4 shadow-sm sm:p-6">
          <div className="mb-5 flex items-end justify-between gap-4"><div><p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-hooma-accent">Shop by department</p><h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">{georgian ? "რას ეძებ დღეს?" : "What are you looking for?"}</h2></div><Link href="/shop" className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-hooma-accent hover:underline">{georgian ? "მთელი კატალოგი" : "Full catalog"}<ArrowRight size={15} /></Link></div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
            {catalogCategories.map((category) => (
              <Link key={category.slug} href={`/shop?category=${category.slug}`} className="group rounded-2xl border border-hooma-text/10 bg-hooma-background p-4 transition hover:-translate-y-0.5 hover:border-hooma-accent/40 hover:shadow-sm">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-hooma-panel text-hooma-accent transition group-hover:bg-hooma-accent group-hover:text-white"><category.icon size={19} /></div>
                <h3 className="mt-4 min-h-10 text-sm font-semibold leading-5">{georgian ? category.nameKa : category.name}</h3>
                <p className="mt-2 text-xs text-hooma-muted">{category.subcategories.length} {georgian ? "განყოფილება" : "sections"}</p>
              </Link>
            ))}
          </div>
        </section>

        <ProductShelf eyebrow="Popular now" title={georgian ? "პოპულარული პროდუქტები" : "Popular products"} products={products.slice(0, 7)} />

        <div className="grid gap-6 lg:grid-cols-3">
          {catalogCategories.slice(0, 3).map((category) => (
            <section key={category.slug} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
              <div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-hooma-panel text-hooma-accent"><category.icon size={20} /></span><h2 className="text-xl font-semibold">{georgian ? category.nameKa : category.name}</h2></div>
              <div className="mt-5 grid gap-2">{category.subcategories.map((sub) => <Link key={sub.slug} href={`/shop?category=${category.slug}&subcategory=${sub.slug}`} className="flex items-center justify-between rounded-xl bg-hooma-background px-4 py-3 text-sm text-hooma-muted transition hover:bg-hooma-panel hover:text-hooma-text"><span>{georgian ? sub.nameKa : sub.name}</span><ArrowRight size={14} /></Link>)}</div>
              <Link href={`/shop?category=${category.slug}`} className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-hooma-accent hover:underline">{georgian ? "ყველას ნახვა" : "See all"}<ArrowRight size={14} /></Link>
            </section>
          ))}
        </div>

        {deskProducts.length ? <ProductShelf title={georgian ? "სამუშაო სივრცე და ტექნიკა" : "Desk & tech"} products={deskProducts} href="/shop?category=desk-tech" /> : null}
        {homeProducts.length ? <ProductShelf title={georgian ? "სახლის ორგანიზებისთვის" : "For an organized home"} products={homeProducts} href="/shop?category=home-organization" /> : null}

        <section className="grid gap-5 rounded-[1.5rem] bg-hooma-text p-6 text-white lg:grid-cols-[0.9fr_1.1fr] lg:p-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#c8d8bd]">Hooma promise</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{georgian ? "შეკვეთიდან მესამე სამუშაო დღეს" : "Ready on the third business day"}</h2>
            <p className="mt-4 max-w-xl text-sm leading-7 text-white/60">{georgian ? "ყველა შეკვეთას ამოწმებს ოპერატორი. წარმოება იწყება მხოლოდ დადასტურების შემდეგ და სტატუსს პირად გვერდზე ნახავ." : "Every order is operator-reviewed. Production begins after confirmation, and status remains visible in your account."}</p>
            <Button href="/how-it-works" variant="secondary" className="mt-6 border-white/15 bg-white/10 text-white hover:text-white">{georgian ? "როგორ მუშაობს" : "How it works"}</Button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {[[Clock3, "3 სამუშაო დღე", "შეკვეთის მიღებიდან მიწოდებამდე"], [MapPin, "დამზადებულია თბილისში", "ადგილობრივი წარმოება"], [ShieldCheck, "ხარისხის კონტროლი", "ოპერატორის შემოწმება"], [PackageCheck, "შეკვეთის ტრეკინგი", "სტატუსი ყოველ ეტაპზე"]].map(([Icon, title, copy]) => { const ItemIcon = Icon as typeof Printer; return <div key={String(title)} className="rounded-2xl border border-white/10 bg-white/[0.06] p-5"><ItemIcon size={20} className="text-[#c8d8bd]" /><h3 className="mt-4 font-semibold">{String(title)}</h3><p className="mt-1 text-xs leading-5 text-white/50">{String(copy)}</p></div>; })}
          </div>
        </section>

        {personalProducts.length ? <ProductShelf title={georgian ? "პერსონალური და ინდივიდუალური" : "Personal & custom"} products={personalProducts} href="/shop?category=custom-parts" /> : null}

        <div className="grid gap-3 text-sm sm:grid-cols-3">
          {[[CheckCircle2, "უსაფრთხო სატესტო შეკვეთა", "რეალური გადახდა ჯერ გამორთულია"], [Printer, "წარმოება მოთხოვნის შემდეგ", "ზედმეტი მარაგის გარეშე"], [PackageCheck, "ადამიანის კონტროლი", "ავტომატიზაცია ოპერატორის ზედამხედველობით"]].map(([Icon, title, copy]) => { const InfoIcon = Icon as typeof Printer; return <div key={String(title)} className="flex gap-3 rounded-2xl border border-hooma-text/10 bg-white/70 p-4"><InfoIcon size={19} className="mt-0.5 shrink-0 text-hooma-accent" /><div><h3 className="font-semibold">{String(title)}</h3><p className="mt-1 text-xs leading-5 text-hooma-muted">{String(copy)}</p></div></div>; })}
        </div>
      </div>
    </main>
  );
}
