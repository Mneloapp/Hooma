"use client";

import { Button } from "@/components/Button";
import { useCart } from "@/components/CartContext";
import { SectionTitle } from "@/components/SectionTitle";

export default function CartPage() {
  const { items, openCart } = useCart();
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow="Cart" title="Your selected pieces." />
      <div className="rounded-2xl bg-white p-6 text-center">
        <p className="text-hooma-muted">{items.length ? `${items.length} cart item group${items.length > 1 ? "s" : ""} selected.` : "Your cart is empty."}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={openCart}>Open cart drawer</Button>
          <Button href="/shop" variant="secondary">Continue shopping</Button>
        </div>
      </div>
    </section>
  );
}
