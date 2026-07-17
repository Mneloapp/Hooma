"use client";

import { BadgePercent, CheckCircle2, Clock3, ShieldCheck } from "lucide-react";
import { Button } from "@/components/Button";
import { useCart } from "@/components/CartContext";
import type { DailyDeal } from "@/lib/daily-deals";
import { useLanguage } from "@/components/LanguageProvider";

const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL" });

export function DailyDealBuyBox({ deal }: { deal: DailyDeal }) {
  const { addItem } = useCart();
  const { language } = useLanguage();
  const georgian = language === "ka";
  const purchasable = !deal.preview && deal.dealPrice !== null && deal.originalPrice !== null;

  const addToCart = () => {
    if (!purchasable) return;
    addItem({
      product_id: deal.productId,
      variant_id: deal.variantId,
      inventory_id: null,
      product_name: deal.nameEn,
      name: deal.name,
      image: deal.image,
      sku: deal.sku,
      size_label: deal.sizeLabel,
      material: "სტანდარტული",
      color: "სტანდარტული",
      quantity: 1,
      price: deal.dealPrice,
      pricePlaceholder: "ფასი დამტკიცების შემდეგ",
    });
  };

  return (
    <aside className="rounded-2xl border border-hooma-text/10 bg-white p-5 shadow-sm lg:sticky lg:top-32">
      <div className="flex items-center gap-2 text-red-600"><BadgePercent size={19} /><span className="text-sm font-bold">{georgian ? "დღის შეთავაზება" : "Daily deal"} · −{deal.discountPercent}%</span></div>
      {purchasable ? (
        <div className="mt-4 flex items-baseline gap-2"><span className="text-3xl font-bold text-red-600">{money.format(deal.dealPrice!)}</span><span className="text-sm text-hooma-muted line-through">{money.format(deal.originalPrice!)}</span></div>
      ) : <p className="mt-4 text-lg font-semibold">{georgian ? "ფასი დამტკიცების შემდეგ" : "Price after approval"}</p>}
      <div className="mt-5 grid gap-3 rounded-xl bg-hooma-panel p-4 text-xs leading-5 text-hooma-muted">
        <p className="flex gap-2"><Clock3 size={15} className="mt-0.5 shrink-0 text-hooma-accent" />{georgian ? "შეთავაზება მოქმედებს თბილისის დროით მიმდინარე დღის ბოლომდე." : "The offer is valid until the end of the current day in Tbilisi time."}</p>
        <p className="flex gap-2"><ShieldCheck size={15} className="mt-0.5 shrink-0 text-hooma-accent" />{georgian ? "საბოლოო ფასი Checkout-ზე დაცულ სერვერზე ხელახლა მოწმდება." : "The final price is revalidated on the secure server at checkout."}</p>
        <p className="flex gap-2"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-hooma-accent" />{georgian ? "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე." : "3 business days from order to delivery."}</p>
      </div>
      <Button className="mt-5 w-full" onClick={addToCart} disabled={!purchasable}>{georgian ? "კალათაში დამატება" : "Add to cart"}</Button>
      {!purchasable ? <p className="mt-3 text-center text-xs leading-5 text-hooma-muted">{georgian ? "ეს დემო პროდუქტი შესაძენად მხოლოდ ფასისა და წარმოების პროფილის დამტკიცების შემდეგ გააქტიურდება." : "This demo product becomes purchasable after its price and production profile are approved."}</p> : null}
    </aside>
  );
}
