"use client";

import Link from "next/link";
import { Menu, ShoppingBag, UserRound, X } from "lucide-react";
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

  return (
    <header className="sticky top-0 z-40 border-b border-hooma-text/10 bg-hooma-background/92 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandLogo className="w-[92px]" imageClassName="max-h-12" />
        <nav className="hidden items-center gap-5 text-[13px] text-hooma-muted xl:flex">
          {nav.map(([label, href]) => <Link key={label} href={href} className="transition hover:text-hooma-text">{label}</Link>)}
          <Link href="/shop?category=custom-parts" className="font-medium text-hooma-accent">{t.header.custom}</Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <div className="hidden lg:block"><LanguageToggle /></div>
          <Link href="/login" aria-label={t.header.login} className="hidden rounded-full p-2.5 transition hover:bg-hooma-panel lg:block"><UserRound size={19} /></Link>
          <button onClick={openCart} aria-label="Open cart" className="relative rounded-full p-2.5 transition hover:bg-hooma-panel">
            <ShoppingBag size={20} />
            {count ? <span className="absolute right-0 top-0 grid min-h-4 min-w-4 place-items-center rounded-full bg-hooma-accent px-1 text-[9px] text-white">{count}</span> : null}
          </button>
          <button aria-label="Open menu" onClick={() => setOpen(!open)} className="rounded-full p-2.5 transition hover:bg-hooma-panel xl:hidden">
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>
      {open ? (
        <nav className="grid gap-1 border-t border-hooma-text/10 bg-hooma-background px-4 py-4 text-sm xl:hidden">
          {nav.map(([label, href]) => <Link key={label} href={href} onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 hover:bg-hooma-panel">{label}</Link>)}
          <Link href="/shop?category=custom-parts" onClick={() => setOpen(false)} className="rounded-xl px-3 py-3 font-medium text-hooma-accent hover:bg-hooma-panel">{t.header.custom}</Link>
          <div className="mt-2 border-t border-hooma-text/10 px-3 pt-4"><LanguageToggle /></div>
          <Link href="/login" onClick={() => setOpen(false)} className="flex items-center gap-2 rounded-xl px-3 py-3 font-medium hover:bg-hooma-panel"><UserRound size={16} />{t.header.loginAccount}</Link>
        </nav>
      ) : null}
    </header>
  );
}
