import Link from "next/link";
import { products } from "@/data/products";

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").toLowerCase();
  const category = params.category ?? "all";
  const filtered = products.filter((product) => {
    const matchesQuery = `${product.hoomaName} ${product.originalModelCode} ${product.originalName}`.toLowerCase().includes(q);
    const matchesCategory = category === "all" || product.category === category;
    return matchesQuery && matchesCategory;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog</p>
          <h1 className="mt-3 text-4xl font-medium">Products</h1>
        </div>
        <Link href="/admin/products/new" className="rounded-full bg-hooma-text px-5 py-3 text-sm font-medium text-white">Create product</Link>
      </div>
      <form className="flex flex-col gap-3 rounded-[1.5rem] bg-white/70 p-4 sm:flex-row">
        <input name="q" defaultValue={params.q} placeholder="Search products" className="min-h-11 flex-1 rounded-full border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent" />
        <select name="category" defaultValue={category} className="min-h-11 rounded-full border border-hooma-text/10 px-4 outline-none focus:border-hooma-accent">
          <option value="all">All categories</option>
          <option>Sofas</option>
          <option>Sofa Beds</option>
          <option>Lounge Chairs</option>
          <option>Ottomans</option>
          <option>Pet Collection</option>
        </select>
        <button className="rounded-full border border-hooma-text/10 px-5 py-3 text-sm font-medium">Filter</button>
      </form>
      <div className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft">
        <div className="overflow-x-auto">
          <table className="min-w-[820px] w-full text-left text-sm">
            <thead className="bg-hooma-panel text-xs uppercase tracking-[0.18em] text-hooma-muted">
              <tr><th className="px-5 py-4">Product</th><th className="px-5 py-4">Original</th><th className="px-5 py-4">Category</th><th className="px-5 py-4">Variants</th><th className="px-5 py-4">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-hooma-text/10">
              {filtered.map((product) => (
                <tr key={product.id}>
                  <td className="px-5 py-4"><Link href={`/admin/products/${product.id}`} className="font-medium hover:text-hooma-accent">{product.hoomaName}</Link><span className="block text-xs text-hooma-muted">{product.slug}</span></td>
                  <td className="px-5 py-4 text-hooma-muted">{product.originalModelCode} {product.originalName}</td>
                  <td className="px-5 py-4 text-hooma-muted">{product.category}</td>
                  <td className="px-5 py-4 text-hooma-muted">{product.variants.length}</td>
                  <td className="px-5 py-4"><span className="rounded-full bg-hooma-accent/10 px-3 py-1 text-xs text-hooma-accent">active</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
