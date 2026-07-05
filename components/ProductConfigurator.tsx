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
  const [fabric, setFabric] = useState(product.availableFabrics[0] ?? "TBD");
  const [color, setColor] = useState(product.availableColors[0] ?? "TBD");
  const [orientation, setOrientation] = useState("Standard");
  const [quantity, setQuantity] = useState(1);
  const { addItem } = useCart();

  const specs = useMemo(
    () => [
      ["SKU", variant.sku],
      ["Product dimensions", variant.productDimensionsCm],
      ["Packing dimensions", variant.packingDimensionsCm],
      ["Gross weight", variant.grossWeightKg],
    ],
    [variant],
  );

  return (
    <div className={compact ? "rounded-2xl bg-white p-5" : "lg:sticky lg:top-24"}>
      {compact ? (
        <div className="relative mb-5 aspect-[4/3] overflow-hidden rounded-xl bg-hooma-panel">
          <Image src={variant.image} alt={product.hoomaName} fill className="object-cover" sizes="(min-width: 1024px) 40vw, 100vw" />
        </div>
      ) : null}
      <div className="space-y-6">
        <VariantSelector variants={product.variants} selectedId={variant.id} onChange={setVariant} />
        <SwatchSelector label="Fabric" options={variant.availableFabrics} value={fabric} onChange={setFabric} />
        <SwatchSelector label="Color" options={variant.availableColors} value={color} onChange={setColor} />
        <SwatchSelector label="Orientation" options={["Standard", "Left-facing", "Right-facing"]} value={orientation} onChange={setOrientation} />
        <div>
          <p className="mb-3 text-sm font-medium">Quantity</p>
          <div className="inline-flex items-center rounded-full border border-hooma-text/10 bg-white">
            <button className="h-11 w-11" onClick={() => setQuantity(Math.max(1, quantity - 1))}>-</button>
            <span className="w-8 text-center text-sm">{quantity}</span>
            <button className="h-11 w-11" onClick={() => setQuantity(quantity + 1)}>+</button>
          </div>
        </div>
        <div className="rounded-xl bg-hooma-panel p-4 text-sm">
          {specs.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4 border-b border-hooma-text/10 py-2 last:border-0">
              <span className="text-hooma-muted">{label}</span>
              <span className="text-right font-medium">{value}</span>
            </div>
          ))}
          <p className="mt-3 text-xs text-hooma-muted">Selected: {fabric}, {color}. Final color may vary slightly depending on fabric and lighting.</p>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm text-hooma-muted">Price</span>
          <span className="font-semibold">{variant.pricePlaceholder}</span>
        </div>
        <Button
          className="w-full"
          onClick={() =>
            addItem({
              productId: product.id,
              variantId: variant.id,
              name: product.hoomaName,
              image: variant.image,
              fabric,
              color,
              orientation,
              quantity,
              pricePlaceholder: variant.pricePlaceholder,
            })
          }
        >
          Add to Cart
        </Button>
        <Button href="/contact" variant="secondary" className="w-full">Request Consultation</Button>
      </div>
    </div>
  );
}
