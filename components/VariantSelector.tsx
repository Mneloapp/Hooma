"use client";

import type { ProductVariant } from "@/data/products";
import { cn } from "@/lib/utils";

export function VariantSelector({
  variants,
  selectedId,
  onChange,
}: {
  variants: ProductVariant[];
  selectedId: string;
  onChange: (variant: ProductVariant) => void;
}) {
  return (
    <div className="grid gap-2">
      {variants.map((variant) => (
        <button
          key={variant.id}
          onClick={() => onChange(variant)}
          className={cn(
            "rounded-xl border p-3 text-left text-sm transition",
            selectedId === variant.id ? "border-hooma-accent bg-hooma-accent/10" : "border-hooma-text/10 bg-white hover:border-hooma-accent/50",
          )}
        >
          <span className="font-medium">{variant.sizeLabel}</span>
          <span className="mt-1 block text-xs text-hooma-muted">{variant.layoutLabel}</span>
        </button>
      ))}
    </div>
  );
}
