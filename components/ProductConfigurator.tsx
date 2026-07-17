"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { CheckCircle2, Clock3, Layers3, PackageCheck, ShieldCheck } from "lucide-react";
import type { Product, ProductVariant } from "@/data/products";
import { Button } from "./Button";
import { SwatchSelector } from "./SwatchSelector";
import { VariantSelector } from "./VariantSelector";
import { useCart } from "./CartContext";
import { fixedMulticolorLabel } from "@/data/product-colors";
import { useLanguage } from "./LanguageProvider";

export function ProductConfigurator({ product, compact = false }: { product: Product; compact?: boolean }) {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const [variant, setVariant] = useState<ProductVariant>(product.variants[0]);
  const [material, setMaterial] = useState(product.availableMaterials[0] ?? "PLA+");
  const [color, setColor] = useState(product.availableColors[0] ?? "Warm white");
  const [quantity, setQuantity] = useState(1);
  const { addItem, openCart } = useCart();
  const orderable = product.isOrderable && product.sourcePlatform !== "other";
  const fixedMulticolor = variant.colorMode === "fixed_multicolor" && variant.amsRequired;

  const selectVariant = (nextVariant: ProductVariant) => {
    setVariant(nextVariant);
    setMaterial(nextVariant.availableMaterials[0] ?? "PLA+");
    setColor(nextVariant.availableColors[0] ?? "სტანდარტული");
  };

  const specs = useMemo(
    () => [
      ["SKU", variant.sku],
      [georgian ? "ზომები" : "Dimensions", variant.productDimensionsCm],
      [georgian ? "მასალა" : "Material", material],
      [georgian ? "ვადა" : "Lead time", georgian ? `${product.leadTimeDays} სამუშაო დღე შეკვეთიდან მიწოდებამდე` : `${product.leadTimeDays} business days from order to delivery`],
    ],
    [georgian, material, product.leadTimeDays, variant],
  );

  const addConfiguredItem = () => {
    if (!orderable) return;
    addItem({
    product_id: product.id,
    variant_id: variant.id,
    inventory_id: null,
    product_name: product.hoomaName,
    name: product.nameKa,
    image: variant.image,
    sku: variant.sku,
    size_label: variant.sizeLabel,
    material,
    color,
    quantity,
    price: variant.price,
    pricePlaceholder: variant.pricePlaceholder,
    price_placeholder: variant.pricePlaceholder,
    });
  };

  return (
    <div className={compact ? "rounded-2xl bg-white p-5" : "rounded-2xl border border-hooma-text/15 bg-white p-5 shadow-sm lg:sticky lg:top-32"}>
      {compact ? <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-xl bg-hooma-panel"><Image src={variant.image} alt={product.nameKa} fill className="object-cover" sizes="(min-width: 1024px) 40vw, 100vw" /></div> : null}
      <div className="space-y-5">
      {!compact ? <div className="border-b border-hooma-text/10 pb-4"><p className="text-xs text-hooma-muted">{georgian ? "ფასი" : "Price"}</p><p className="mt-1 text-2xl font-semibold">{variant.price === null ? (georgian ? variant.pricePlaceholder : "Price after review") : `₾${variant.price}`}</p><p className="mt-3 flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 size={16} />{georgian ? "შეკვეთა ხელმისაწვდომია" : "Available to order"}</p></div> : null}
        {product.variants.length > 1 ? <VariantSelector variants={product.variants} selectedId={variant.id} onChange={selectVariant} /> : null}
        <SwatchSelector label={georgian ? "მასალა" : "Material"} options={variant.availableMaterials} value={material} onChange={setMaterial} />
        {fixedMulticolor ? <div className="rounded-2xl border border-hooma-text/10 bg-hooma-panel/70 p-4"><div className="flex items-center gap-2"><Layers3 size={17} className="text-hooma-accent" /><p className="text-sm font-semibold">{georgian ? fixedMulticolorLabel : "Multicolor — as shown"}</p></div><p className="mt-3 text-xs leading-5 text-hooma-muted">{georgian ? "ეს არის ფიქსირებული AMS კომბინაცია. პროდუქტი დამზადდება ზუსტად ფოტოზე ნაჩვენები ფერებით და ცალკეული ფერის არჩევა საჭირო არ არის." : "This is a fixed AMS combination. The product is made in the colors shown in the photo, so no separate color selection is needed."}</p></div> : <SwatchSelector label={georgian ? "ფერი" : "Color"} options={variant.availableColors} value={color} onChange={setColor} />}
        <div>
          <p className="mb-3 text-sm font-medium">{georgian ? "რაოდენობა" : "Quantity"}</p>
          <div className="inline-flex items-center rounded-full border border-hooma-text/10 bg-white">
            <button type="button" aria-label="Decrease quantity" className="h-11 w-11" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
            <span className="w-8 text-center text-sm">{quantity}</span>
            <button type="button" aria-label="Increase quantity" className="h-11 w-11" onClick={() => setQuantity(quantity + 1)}>+</button>
          </div>
        </div>
        <div className="rounded-2xl bg-hooma-panel p-4 text-sm">
          {specs.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-hooma-text/10 py-2.5 last:border-0"><span className="text-hooma-muted">{label}</span><span className="text-right font-medium">{value}</span></div>)}
          <p className="mt-3 text-xs leading-5 text-hooma-muted">{georgian ? "ეკრანზე ნაჩვენები ფერი შესაძლოა რეალური მასალისგან მცირედ განსხვავდებოდეს." : "The color shown on screen may differ slightly from the physical material."}</p>
        </div>
        {compact ? <div className="flex items-center justify-between rounded-2xl border border-hooma-text/10 bg-white p-4">
          <div><p className="text-xs text-hooma-muted">{georgian ? "ფასი" : "Price"}</p><p className="mt-1 font-semibold">{variant.price === null ? (georgian ? variant.pricePlaceholder : "Price after review") : `₾${variant.price}`}</p></div>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">Catalog preview</span>
        </div> : null}
        <Button
          className="w-full"
          onClick={addConfiguredItem}
          disabled={!orderable}
        >
          {orderable ? (georgian ? "კალათაში დამატება" : "Add to cart") : (georgian ? "მიუწვდომელია დამტკიცებამდე" : "Unavailable until approved")}
        </Button>
        {!compact && orderable ? <button type="button" onClick={() => { addConfiguredItem(); openCart(); }} className="h-12 w-full rounded-full border border-hooma-text/15 bg-[#d9e6d2] text-sm font-semibold text-hooma-text transition hover:bg-[#cbdcc2]">{georgian ? "შეუკვეთე ახლა — სატესტო" : "Order now — test mode"}</button> : null}
        {!compact ? <div className="grid gap-2 border-t border-hooma-text/10 pt-4 text-xs text-hooma-muted">{(georgian ? [[Clock3, "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე"], [PackageCheck, "შეკვეთის სტატუსის ტრეკინგი"], [ShieldCheck, "ოპერატორის ხარისხის კონტროლი"]] : [[Clock3, "3 business days from order to delivery"], [PackageCheck, "Order status tracking"], [ShieldCheck, "Operator quality control"]]).map(([Icon, label]) => { const TrustIcon = Icon as typeof Clock3; return <p key={String(label)} className="flex items-center gap-2"><TrustIcon size={14} className="text-hooma-accent" />{String(label)}</p>; })}</div> : null}
        <p className="text-center text-xs leading-5 text-hooma-muted">{orderable ? (georgian ? "სატესტო რეჟიმში შეკვეთა არ ითვლება გადახდილად და ბეჭდვა ავტომატურად არ დაიწყება." : "In test mode, the order is not considered paid and printing does not start automatically.") : (georgian ? "ეს სატესტო Preview შეკვეთაში ვერ დაემატება და ანონიმურ მომხმარებელს არ უჩანს." : "This test preview cannot be added to an order and is hidden from anonymous users.")}</p>
      </div>
    </div>
  );
}
