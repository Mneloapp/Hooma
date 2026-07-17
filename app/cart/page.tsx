"use client";

import { Button } from "@/components/Button";
import { useCart } from "@/components/CartContext";
import { SectionTitle } from "@/components/SectionTitle";
import { useLanguage } from "@/components/LanguageProvider";

export default function CartPage() {
  const { items, openCart } = useCart();
  const { language } = useLanguage();
  const georgian = language === "ka";
  return (
    <section className="mx-auto max-w-4xl px-4 py-16 sm:px-6 lg:px-8">
      <SectionTitle eyebrow={georgian ? "კალათა" : "Cart"} title={georgian ? "შენ მიერ არჩეული პროდუქტები" : "Your selected products"} />
      <div className="rounded-2xl bg-white p-6 text-center">
        <p className="text-hooma-muted">{items.length ? (georgian ? `არჩეულია ${items.length} პროდუქტის ჯგუფი.` : `${items.length} product group${items.length === 1 ? "" : "s"} selected.`) : (georgian ? "კალათა ცარიელია." : "Your cart is empty.")}</p>
        <div className="mt-5 flex justify-center gap-3">
          <Button onClick={openCart}>{georgian ? "კალათის გახსნა" : "Open cart"}</Button>
          <Button href="/shop" variant="secondary">{georgian ? "შოპინგის გაგრძელება" : "Continue shopping"}</Button>
        </div>
      </div>
    </section>
  );
}
