import type { Product } from "@/data/products";

export function ProductEditor({ product }: { product: Product }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <label className="block text-sm font-medium">HOOMA name<input defaultValue={product.hoomaName} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Slug<input defaultValue={product.slug} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Category<input defaultValue={product.category} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Delivery estimate<input defaultValue={product.deliveryEstimate} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium lg:col-span-2">Short description<textarea defaultValue={product.shortDescription} rows={3} className="mt-2 w-full rounded-[1.5rem] border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium lg:col-span-2">Long description<textarea defaultValue={product.longDescription} rows={6} className="mt-2 w-full rounded-[1.5rem] border border-hooma-text/10 px-4 py-3" /></label>
    </div>
  );
}
