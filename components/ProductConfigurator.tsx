"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import type { Product, ProductVariant } from "@/data/products";
import { Button } from "./Button";
import { SwatchSelector } from "./SwatchSelector";
import { VariantSelector } from "./VariantSelector";
import { useCart } from "./CartContext";

export function ProductConfigurator({ product, compact = false }: { product: Product; compact?: boolean }) {
  const [variant, setVariant] = useState<ProductVariant>(product.variants[0]);
  const [material, setMaterial] = useState(product.availableMaterials[0] ?? "PLA+");
  const [color, setColor] = useState(product.availableColors[0] ?? "Warm white");
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  const specs = useMemo(
    () => [
      ["SKU", variant.sku],
      ["ზომები", variant.productDimensionsCm],
      ["მასალა", material],
      ["მომზადება", `${product.leadTimeDays} სამუშაო დღე`],
    ],
    [material, product.leadTimeDays, variant],
  );

  return (
    <div className={compact ? "rounded-2xl bg-white p-5" : "lg:sticky lg:top-24"}>
      {compact ? <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-xl bg-hooma-panel"><Image src={variant.image} alt={product.nameKa} fill className="object-cover" sizes="(min-width: 1024px) 40vw, 100vw" /></div> : null}
      <div className="space-y-6">
        {product.variants.length > 1 ? <VariantSelector variants={product.variants} selectedId={variant.id} onChange={setVariant} /> : null}
        <SwatchSelector label="მასალა" options={variant.availableMaterials} value={material} onChange={setMaterial} />
        <SwatchSelector label="ფერი" options={variant.availableColors} value={color} onChange={setColor} />
        <div>
          <p className="mb-3 text-sm font-medium">რაოდენობა</p>
          <div className="inline-flex items-center rounded-full border border-hooma-text/10 bg-white">
            <button type="button" aria-label="Decrease quantity" className="h-11 w-11" onClick={() => setQuantity(Math.max(1, quantity - 1))}>−</button>
            <span className="w-8 text-center text-sm">{quantity}</span>
            <button type="button" aria-label="Increase quantity" className="h-11 w-11" onClick={() => setQuantity(quantity + 1)}>+</button>
          </div>
        </div>
        <div className="rounded-2xl bg-hooma-panel p-4 text-sm">
          {specs.map(([label, value]) => <div key={label} className="flex justify-between gap-4 border-b border-hooma-text/10 py-2.5 last:border-0"><span className="text-hooma-muted">{label}</span><span className="text-right font-medium">{value}</span></div>)}
          <p className="mt-3 text-xs leading-5 text-hooma-muted">ეკრანზე ნაჩვენები ფერი შესაძლოა რეალური მასალისგან მცირედ განსხვავდებოდეს.</p>
        </div>
        <div className="flex items-center justify-between rounded-2xl border border-hooma-text/10 bg-white p-4">
          <div><p className="text-xs text-hooma-muted">ფასი</p><p className="mt-1 font-semibold">{variant.price === null ? variant.pricePlaceholder : `₾${variant.price}`}</p></div>
          <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-medium text-amber-800">Catalog preview</span>
        </div>
        <Button
          className="w-full"
          onClick={() => addItem({
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
          })}
        >
          კალათაში დამატება
        </Button>
        <p className="text-center text-xs leading-5 text-hooma-muted">სატესტო რეჟიმში შეკვეთა არ ითვლება გადახდილად და ბეჭდვა ავტომატურად არ დაიწყება.</p>
      </div>
    </div>
  );
}
