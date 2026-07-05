import type { ProductVariant } from "@/data/products";

export function VariantEditor({ variants }: { variants: ProductVariant[] }) {
  return (
    <div className="space-y-4">
      {variants.map((variant) => (
        <div key={variant.id} className="rounded-[1.25rem] border border-hooma-text/10 bg-white/65 p-4">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="block text-sm font-medium">SKU<input defaultValue={variant.sku} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
            <label className="block text-sm font-medium">Size<input defaultValue={variant.sizeLabel} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
            <label className="block text-sm font-medium">Gross weight<input defaultValue={variant.grossWeightKg} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
          </div>
          <p className="mt-3 text-sm text-hooma-muted">Dimensions: {variant.productDimensionsCm} / Packing: {variant.packingDimensionsCm}</p>
        </div>
      ))}
    </div>
  );
}
