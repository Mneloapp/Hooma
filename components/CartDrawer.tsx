"use client";

import Image from "next/image";
import Link from "next/link";
import { X } from "lucide-react";
import { Button } from "./Button";
import { useCart } from "./CartContext";
import { useLanguage } from "./LanguageProvider";

export function CartDrawer() {
  const { items, isOpen, closeCart, updateQuantity, keyFor } = useCart();
  const { language } = useLanguage();
  const georgian = language === "ka";
  const pricesComplete = items.length > 0 && items.every(
    (item) => typeof item.price === "number" && Number.isFinite(item.price),
  );
  const subtotal = pricesComplete
    ? items.reduce((sum, item) => sum + Number(item.price) * item.quantity, 0)
    : 0;
  const money = new Intl.NumberFormat(georgian ? "ka-GE" : "en-GB", {
    style: "currency",
    currency: "GEL",
    currencyDisplay: "narrowSymbol",
  });

  return (
    <div className={`fixed inset-0 z-50 ${isOpen ? "" : "pointer-events-none"}`}>
      <div className={`absolute inset-0 bg-black/25 transition ${isOpen ? "opacity-100" : "opacity-0"}`} onClick={closeCart} />
      <aside
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-hooma-background p-6 shadow-soft transition duration-300 ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">{georgian ? "კალათა" : "Cart"}</h2>
          <button aria-label="Close cart" onClick={closeCart} className="rounded-full p-2 hover:bg-hooma-panel">
            <X size={20} />
          </button>
        </div>
        <div className="mt-8 space-y-5">
          {items.length === 0 ? <p className="text-sm text-hooma-muted">{georgian ? "კალათა ცარიელია." : "Your cart is empty."}</p> : null}
          {items.map((item) => (
            <div key={keyFor(item)} className="grid grid-cols-[88px_1fr] gap-4 border-b border-hooma-text/10 pb-5">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-hooma-panel">
                <Image src={item.image} alt={item.name} fill className="object-cover" sizes="88px" />
              </div>
              <div>
                <div className="flex justify-between gap-3">
                  <h3 className="font-medium">{georgian ? item.name : item.product_name}</h3>
                  <span className="text-sm text-hooma-muted">{typeof item.price === "number" ? money.format(item.price * item.quantity) : item.pricePlaceholder}</span>
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
        {items.length ? (
          <div className="mt-6 rounded-2xl border border-hooma-text/10 bg-white/70 p-4 text-sm">
            <div className="flex justify-between gap-4"><span className="text-hooma-muted">{georgian ? "პროდუქტები" : "Products"}</span><strong>{pricesComplete ? money.format(subtotal) : "—"}</strong></div>
            <p className="mt-3 text-xs leading-5 text-hooma-muted">{georgian ? "მიწოდება Checkout-ზე ითვლება: Hooma+ წევრისთვის ან 100₾-ზე მეტი პროდუქტის ჯამზე — უფასო. პირველი 10 პროდუქტის ერთეულის ბენეფიტისთვის მთელი კალათა დარჩენილ ბალანსში უნდა ჩაეტიოს; სხვა შემთხვევაში მიწოდება 5₾-ია." : "Delivery is calculated at checkout: free with Hooma+ or when products total over ₾100. For the first-10 product-unit benefit, the whole cart must fit the remaining balance; otherwise delivery is ₾5."}</p>
            <Link href="/hooma-plus" onClick={closeCart} className="mt-3 inline-flex text-xs font-semibold text-hooma-accent hover:underline">{georgian ? "Hooma+ პირობები" : "Hooma+ details"}</Link>
          </div>
        ) : null}
        <Button href="/checkout" className="mt-8 w-full" onClick={closeCart}>
          {georgian ? "შეკვეთის გაგრძელება" : "Continue to checkout"}
        </Button>
      </aside>
    </div>
  );
}
