"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteCatalogProductsAction } from "@/app/admin/products/actions";

export type CatalogProductListItem = {
  id: string;
  name: string;
  slug: string;
  category: string;
  categorySlug: string;
  subcategory: string;
  printMinutes: number | null;
  grams: number | null;
  price: number | null;
  production: string;
  status: string;
};

export function CatalogProductTable({ products, canDelete }: { products: CatalogProductListItem[]; canDelete: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteCatalogProductsAction, {});
  const router = useRouter();
  const allSelected = products.length > 0 && products.every((product) => selected.has(product.id));
  const selectedProducts = products.filter((product) => selected.has(product.id));

  useEffect(() => {
    if (!state.ok) return;
    setSelected(new Set());
    setConfirming(false);
    router.refresh();
  }, [router, state]);

  function toggleProduct(productId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(products.map((product) => product.id)));
  }

  return <div className="space-y-3">
    {canDelete ? <div className="flex min-h-12 flex-col justify-between gap-3 rounded-2xl border border-hooma-text/10 bg-white/70 px-4 py-3 sm:flex-row sm:items-center">
      <p className="text-sm text-hooma-muted">{selected.size ? `${selected.size} პროდუქტი მონიშნულია` : "მონიშნე ერთი ან რამდენიმე პროდუქტი წასაშლელად"}</p>
      <button type="button" disabled={!selected.size || pending} onClick={() => setConfirming(true)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={16} />მონიშნულების წაშლა</button>
    </div> : null}

    {confirming && selectedProducts.length ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
      <h2 className="font-semibold">ნამდვილად წავშალოთ {selectedProducts.length} პროდუქტი?</h2>
      <p className="mt-2 text-sm leading-6 text-red-900/75">ეს მოქმედება შეუქცევადია. შეკვეთის ან დღის შეთავაზების ისტორიაში გამოყენებული პროდუქტი დაცულია და ასეთ შემთხვევაში მთელი ოპერაცია შეჩერდება.</p>
      <p className="mt-3 text-xs leading-5 text-red-900/65">{selectedProducts.slice(0, 4).map((product) => product.name).join(" · ")}{selectedProducts.length > 4 ? ` · და კიდევ ${selectedProducts.length - 4}` : ""}</p>
      {state.message && !state.ok ? <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-red-800">{state.message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={action}>{selectedProducts.map((product) => <input key={product.id} type="hidden" name="product_ids" value={product.id} />)}<button disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}{pending ? "იშლება..." : `დიახ, წაშალე ${selectedProducts.length}`}</button></form>
        <button type="button" disabled={pending} onClick={() => setConfirming(false)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-800"><X size={16} />გაუქმება</button>
      </div>
    </section> : null}

    {state.ok && state.message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{state.message}</p> : null}

    <div className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft"><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-hooma-panel text-xs uppercase tracking-[0.14em] text-hooma-muted"><tr>{canDelete ? <th className="w-14 px-5 py-4"><input type="checkbox" aria-label="ყველა პროდუქტის მონიშვნა" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-hooma-accent" /></th> : null}<th className="px-5 py-4">პროდუქტი</th><th className="px-5 py-4">კატეგორია</th><th className="px-5 py-4">ტექნიკური</th><th className="px-5 py-4">ფასი</th><th className="px-5 py-4">სტატუსი</th></tr></thead><tbody className="divide-y divide-hooma-text/10">{products.map((product) => <tr key={product.id} className={selected.has(product.id) ? "bg-red-50/60" : undefined}>{canDelete ? <td className="px-5 py-4"><input type="checkbox" aria-label={`${product.name} მონიშვნა`} checked={selected.has(product.id)} onChange={() => toggleProduct(product.id)} className="h-4 w-4 accent-hooma-accent" /></td> : null}<td className="px-5 py-4"><Link href={`/admin/products/${product.id}`} className="font-medium hover:text-hooma-accent">{product.name}</Link><span className="block text-xs text-hooma-muted">{product.slug}</span></td><td className="px-5 py-4 text-hooma-muted">{product.category}<span className="block text-xs">{product.subcategory}</span></td><td className="px-5 py-4 text-hooma-muted">{product.printMinutes ? `${product.printMinutes} წუთი` : "დრო შესავსებია"}<span className="block text-xs">{product.grams ? `${product.grams} გ` : "წონა შესავსებია"}</span></td><td className="px-5 py-4 font-semibold">{product.price === null ? "—" : `₾${product.price.toFixed(2)}`}</td><td className="px-5 py-4"><span className="rounded-full bg-slate-100 px-3 py-1 text-xs">{product.status}</span></td></tr>)}</tbody></table></div></div>
  </div>;
}
