"use client";

import Link from "next/link";
import { ChevronDown, MapPin, Menu, Package, Search, ShoppingCart, UserRound, X } from "lucide-react";
import { useState } from "react";
import { useCart } from "./CartContext";
import { BrandLogo } from "./BrandLogo";
import { LanguageToggle } from "./LanguageToggle";
import { useLanguage } from "./LanguageProvider";

export function Header() {
  const [open, setOpen] = useState(false);
  const { openCart, count } = useCart();
  const { t } = useLanguage();
  const nav = [
    [t.header.shop, "/shop"],
    [t.header.home, "/shop?category=home-organization"],
    [t.header.desk, "/shop?category=desk-tech"],
    [t.header.kitchen, "/shop?category=kitchen"],
    [t.header.kids, "/shop?category=kids-learning"],
    [t.header.pets, "/shop?category=pets"],
  ];

  const SearchForm = ({ mobile = false }: { mobile?: boolean }) => (
    <form action="/shop" className={`flex min-w-0 overflow-hidden rounded-xl bg-white ring-2 ring-transparent transition focus-within:ring-hooma-accent ${mobile ? "w-full" : "flex-1"}`}>
      <label className="sr-only" htmlFor={mobile ? "mobile-category" : "desktop-category"}>კატეგორია</label>
      <div className="relative hidden border-r border-hooma-text/10 bg-hooma-panel sm:block">
        <select id={mobile ? "mobile-category" : "desktop-category"} name="category" defaultValue="" className="h-11 max-w-36 appearance-none bg-transparent py-0 pl-3 pr-8 text-xs text-hooma-muted outline-none">
          <option value="">ყველა კატეგორია</option>
          <option value="home-organization">სახლი</option>
          <option value="desk-tech">ტექნიკა</option>
          <option value="kitchen">სამზარეულო</option>
          <option value="kids-learning">ბავშვები</option>
          <option value="pets">ცხოველები</option>
          <option value="car-accessories">ავტომობილი</option>
          <option value="gifts-personalization">საჩუქრები</option>
        </select>
        <ChevronDown size={13} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-hooma-muted" />
      </div>
      <label className="sr-only" htmlFor={mobile ? "mobile-search" : "desktop-search"}>პროდუქტის ძიება</label>
      <input id={mobile ? "mobile-search" : "desktop-search"} name="q" type="search" placeholder="მოძებნე პროდუქტი Hooma-ზე" className="h-11 min-w-0 flex-1 bg-white px-4 text-sm outline-none placeholder:text-hooma-muted/70" />
      <button type="submit" aria-label="ძიება" className="grid w-12 place-items-center bg-hooma-accent text-white transition hover:bg-hooma-accent/90"><Search size={19} /></button>
    </form>
  );

  return (
    <header className="sticky top-0 z-40 shadow-[0_2px_12px_rgba(23,23,23,0.08)]">
      <div className="bg-hooma-text text-white">
        <div className="mx-auto flex min-h-[68px] max-w-[1480px] items-center gap-3 px-4 py-2 sm:px-6 lg:gap-5 lg:px-8">
          <BrandLogo className="w-[94px] shrink-0 rounded-lg bg-white px-2" imageClassName="max-h-11" />
          <div className="hidden shrink-0 items-center gap-2 text-xs xl:flex">
            <MapPin size={18} className="text-[#c8d8bd]" />
            <span><span className="block text-white/55">მიწოდება</span><strong className="font-medium">თბილისი</strong></span>
          </div>
          <div className="hidden min-w-0 flex-1 md:flex"><SearchForm /></div>
          <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
            <div className="hidden lg:block"><LanguageToggle /></div>
            <Link href="/login" className="hidden items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition hover:bg-white/10 sm:flex">
              <UserRound size={18} /><span><span className="block text-white/55">გამარჯობა, შედი</span><strong className="font-medium">ანგარიში</strong></span>
            </Link>
            <Link href="/account/orders" className="hidden items-center gap-2 rounded-lg px-2.5 py-2 text-xs transition hover:bg-white/10 xl:flex">
              <Package size={18} /><span><span className="block text-white/55">შენი</span><strong className="font-medium">შეკვეთები</strong></span>
            </Link>
            <button onClick={openCart} aria-label="Open cart" className="relative flex items-end gap-1 rounded-lg px-2.5 py-2 transition hover:bg-white/10">
              <ShoppingCart size={25} /><strong className="hidden text-sm sm:block">კალათა</strong>
              {count ? <span className="absolute left-7 top-0 grid min-h-5 min-w-5 place-items-center rounded-full bg-[#c8d8bd] px-1 text-[10px] font-bold text-hooma-text">{count}</span> : null}
            </button>
          </div>
        </div>
        <div className="px-4 pb-3 md:hidden"><SearchForm mobile /></div>
      </div>

      <div className="border-b border-black/10 bg-[#30382e] text-white">
        <div className="mx-auto flex h-10 max-w-[1480px] items-center gap-1 overflow-x-auto px-2 text-[13px] hide-scrollbar sm:px-6 lg:px-8">
          <button aria-label="Open categories" onClick={() => setOpen(!open)} className="flex h-full shrink-0 items-center gap-2 px-2.5 font-semibold transition hover:bg-white/10">
            {open ? <X size={18} /> : <Menu size={18} />}ყველა კატეგორია
          </button>
          {nav.slice(1).map(([label, href]) => <Link key={label} href={href} className="flex h-full shrink-0 items-center px-2.5 transition hover:bg-white/10">{label}</Link>)}
          <Link href="/shop?category=gifts-personalization" className="flex h-full shrink-0 items-center px-2.5 transition hover:bg-white/10">საჩუქრები</Link>
          <Link href="/shop?category=custom-parts" className="flex h-full shrink-0 items-center px-2.5 font-semibold text-[#d7e7cd] transition hover:bg-white/10">{t.header.custom}</Link>
          <span className="ml-auto hidden shrink-0 text-xs text-white/65 xl:block">შეკვეთიდან მესამე სამუშაო დღეს</span>
        </div>
      </div>

      {open ? (
        <div className="absolute inset-x-0 border-b border-hooma-text/10 bg-hooma-background shadow-2xl">
          <nav className="mx-auto grid max-w-7xl gap-2 px-4 py-5 text-sm sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
            {nav.map(([label, href]) => <Link key={label} href={href} onClick={() => setOpen(false)} className="rounded-xl border border-hooma-text/10 bg-white px-4 py-3 font-medium transition hover:border-hooma-accent/40 hover:text-hooma-accent">{label}</Link>)}
            <Link href="/shop?category=gifts-personalization" onClick={() => setOpen(false)} className="rounded-xl border border-hooma-text/10 bg-white px-4 py-3 font-medium transition hover:border-hooma-accent/40 hover:text-hooma-accent">საჩუქრები და პერსონალიზაცია</Link>
            <Link href="/shop?category=custom-parts" onClick={() => setOpen(false)} className="rounded-xl bg-hooma-accent px-4 py-3 font-medium text-white">{t.header.custom}</Link>
            <div className="flex items-center justify-between rounded-xl border border-hooma-text/10 px-4 py-2 lg:hidden"><LanguageToggle /><Link href="/login" onClick={() => setOpen(false)} className="flex items-center gap-2"><UserRound size={16} />{t.header.loginAccount}</Link></div>
          </nav>
        </div>
      ) : null}
    </header>
  );
}
