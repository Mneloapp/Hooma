import type { Product } from "@/data/products";

export function ProductEditor({ product }: { product: Product }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <label className="block text-sm font-medium">Hooma name<input defaultValue={product.hoomaName} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Georgian name<input defaultValue={product.nameKa} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Slug<input defaultValue={product.slug} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Category<input defaultValue={product.category} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Subcategory<input defaultValue={product.subcategory} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium">Lead time (business days)<input type="number" min="1" defaultValue={product.leadTimeDays} className="mt-2 w-full rounded-full border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium lg:col-span-2">Georgian description<textarea defaultValue={product.shortDescriptionKa} rows={3} className="mt-2 w-full rounded-[1.5rem] border border-hooma-text/10 px-4 py-3" /></label>
      <label className="block text-sm font-medium lg:col-span-2">English description<textarea defaultValue={product.shortDescription} rows={3} className="mt-2 w-full rounded-[1.5rem] border border-hooma-text/10 px-4 py-3" /></label>
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 lg:col-span-2">
        Publishing stays disabled until the production profile, cost, safety notes, and test print are approved.
      </div>
    </div>
  );
}
