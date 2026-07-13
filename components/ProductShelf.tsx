"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Product } from "@/data/products";
import { ProductCard } from "./ProductCard";

export function ProductShelf({ title, products, href = "/shop", eyebrow }: { title: string; products: Product[]; href?: string; eyebrow?: string }) {
  return (
    <section className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-4 shadow-sm sm:p-6">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>{eyebrow ? <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-hooma-accent">{eyebrow}</p> : null}<h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h2></div>
        <Link href={href} className="flex shrink-0 items-center gap-1.5 text-sm font-medium text-hooma-accent hover:underline">ყველას ნახვა<ArrowRight size={15} /></Link>
      </div>
      <div className="flex snap-x gap-4 overflow-x-auto pb-2 hide-scrollbar">
        {products.map((product) => <div key={product.id} className="w-[238px] shrink-0 snap-start sm:w-[270px]"><ProductCard product={product} compact /></div>)}
      </div>
    </section>
  );
}
