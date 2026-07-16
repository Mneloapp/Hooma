"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { Button } from "./Button";
import { useCart } from "./CartContext";

export function CartDrawer() {
  const { items, isOpen, closeCart, updateQuantity, keyFor } = useCart();

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}>
      <div className={`absolute inset-0 bg-black/25 transition ${isOpen ? "opacity-100" : "opacity-0"}`} onClick={closeCart} />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-hooma-background p-6 shadow-soft transition duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">კალათა</h2>
          <button aria-label="Close cart" onClick={closeCart} className="rounded-full p-2 hover:bg-hooma-panel">
            <X size={20} />
          </button>
        </div>
        <div className="mt-8 space-y-5">
          {items.length === 0 ? <p className="text-sm text-hooma-muted">კალათა ცარიელია.</p> : null}
          {items.map((item) => (
            <div key={keyFor(item)} className="grid grid-cols-[88px_1fr] gap-4 border-b border-hooma-text/10 pb-5">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-hooma-panel">
                <Image src={item.image} alt={item.name} fill className="object-cover" sizes="88px" />
              </div>
              <div>
                <div className="flex justify-between gap-3">
                  <h3 className="font-medium">{item.name}</h3>
                  <span className="text-sm text-hooma-muted">{item.price ?? item.pricePlaceholder}</span>
                </div>
                <p className="mt-1 text-xs text-hooma-muted">{item.size_label} / {item.material} / {item.color}</p>
                <div className="mt-3 flex items-center gap-3">
                  <button className="h-8 w-8 rounded-full border border-hooma-text/15" onClick={() => updateQuantity(keyFor(item), item.quantity - 1)}>-</button>
                  <span className="text-sm">{item.quantity}</span>
                  <button className="h-8 w-8 rounded-full border border-hooma-text/15" onClick={() => updateQuantity(keyFor(item), item.quantity + 1)}>+</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <Button href="/checkout" className="mt-8 w-full" onClick={closeCart}>
          შეკვეთის გაგრძელება
        </Button>
      </aside>
    </div>
  );
}
