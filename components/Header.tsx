"use client";

import Link from "next/link";
import { Menu, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { useCart } from "./CartContext";
import { BrandLogo } from "./BrandLogo";

const nav = [
  ["Sofas", "/shop?category=Sofas"],
  ["Sofa Beds", "/shop?category=Sofa%20Beds"],
  ["Lounge Chairs", "/shop?category=Lounge%20Chairs"],
  ["Ottomans", "/shop?category=Ottomans"],
  ["Pet Collection", "/shop?category=Pet%20Collection"],
  ["How it works", "/how-it-works"],
];

export function Header() {
  const [open, setOpen] = useState(false);
  const { openCart, count } = useCart();

  return (
    <header className="sticky top-0 z-40 border-b border-hooma-text/10 bg-hooma-background/90 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <BrandLogo className="w-[92px]" imageClassName="max-h-12" />
        <nav className="hidden items-center gap-7 text-sm text-hooma-muted lg:flex">
          {nav.map(([label, href]) => <Link key={label} href={href} className="hover:text-hooma-text">{label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <button onClick={openCart} aria-label="Open cart" className="relative rounded-full p-2 hover:bg-hooma-panel">
            <ShoppingBag size={20} />
            {count ? <span className="absolute -right-1 -top-1 rounded-full bg-hooma-accent px-1.5 text-[10px] text-white">{count}</span> : null}
          </button>
          <button aria-label="Open menu" onClick={() => setOpen(!open)} className="rounded-full p-2 hover:bg-hooma-panel lg:hidden">
            <Menu size={20} />
          </button>
        </div>
      </div>
      {open ? (
        <nav className="grid gap-1 border-t border-hooma-text/10 px-4 py-4 text-sm lg:hidden">
          {nav.map(([label, href]) => <Link key={label} href={href} onClick={() => setOpen(false)} className="rounded-lg px-3 py-3 hover:bg-hooma-panel">{label}</Link>)}
        </nav>
      ) : null}
    </header>
  );
}
