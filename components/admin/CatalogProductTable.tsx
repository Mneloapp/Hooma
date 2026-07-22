"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { CircleCheck, Globe2, LoaderCircle, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { bulkPublishCatalogProductsAction, deleteCatalogProductsAction } from "@/app/admin/products/actions";

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
  auditCompletedAt: string | null;
};

export function CatalogProductTable({ products, canDelete, canPublish }: { products: CatalogProductListItem[]; canDelete: boolean; canPublish: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingPublication, setConfirmingPublication] = useState(false);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteCatalogProductsAction, {});
  const [publicationState, publicationAction, publicationPending] = useActionState(bulkPublishCatalogProductsAction, {});
  const router = useRouter();
  const canSelect = canDelete || canPublish;
  const allSelected = products.length > 0 && products.every((product) => selected.has(product.id));
  const selectedProducts = products.filter((product) => selected.has(product.id));
  const selectedDrafts = selectedProducts.filter((product) => product.status === "draft");
  const allDraftsSelected = products.some((product) => product.status === "draft") && products.filter((product) => product.status === "draft").every((product) => selected.has(product.id));

  useEffect(() => {
    if (!deleteState.ok) return;
    setSelected(new Set());
    setConfirmingDelete(false);
    router.refresh();
  }, [router, deleteState]);

  useEffect(() => {
    if (!publicationState.completed) return;
    setSelected(new Set((publicationState.failures ?? []).map((failure) => failure.productId)));
    setConfirmingPublication(false);
    router.refresh();
  }, [router, publicationState]);

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

  function toggleAllDrafts() {
    setSelected((current) => {
      const next = new Set(current);
      const draftIds = products.filter((product) => product.status === "draft").map((product) => product.id);
      if (allDraftsSelected) draftIds.forEach((id) => next.delete(id));
      else draftIds.forEach((id) => next.add(id));
      return next;
    });
  }

  const busy = deletePending || publicationPending;

  return <div className="space-y-3">
    {canSelect ? <div className="flex min-h-12 flex-col justify-between gap-3 rounded-2xl border border-hooma-text/10 bg-white/70 px-4 py-3 xl:flex-row xl:items-center">
      <div>
        <p className="text-sm font-medium">{selected.size ? `${selected.size} პროდუქტი მონიშნულია` : "მონიშნე პროდუქტები ჯგუფური მოქმედებისთვის"}</p>
        <p className="mt-1 text-xs text-hooma-muted">{selectedDrafts.length ? `${selectedDrafts.length} Draft მზადაა ჯგუფური გამოქვეყნებისთვის` : "გამოსაქვეყნებლად მონიშნე Draft სტატუსის პროდუქტები"}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {canPublish ? <button type="button" disabled={busy || !products.some((product) => product.status === "draft")} onClick={toggleAllDrafts} className="rounded-xl border border-hooma-text/10 bg-white px-4 py-2.5 text-sm font-semibold disabled:opacity-40">{allDraftsSelected ? "Draft-ების მოხსნა" : "ამ გვერდის Draft-ების მონიშვნა"}</button> : null}
        {canPublish ? <button type="button" disabled={busy || !selectedDrafts.length} onClick={() => { setConfirmingDelete(false); setConfirmingPublication(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-hooma-accent px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Globe2 size={16} />გამოქვეყნება ({selectedDrafts.length})</button> : null}
        {canDelete ? <button type="button" disabled={busy || !selected.size} onClick={() => { setConfirmingPublication(false); setConfirmingDelete(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-40"><Trash2 size={16} />მონიშნულების წაშლა</button> : null}
      </div>
    </div> : null}

    {confirmingPublication && selectedDrafts.length ? <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-950">
      <h2 className="font-semibold">გამოვაქვეყნოთ {selectedDrafts.length} Draft პროდუქტი?</h2>
      <p className="mt-2 text-sm leading-6 text-emerald-900/75">მონიშნული Draft-ები დაუყოვნებლივ გამოჩნდება საჯარო კატალოგში. თითოეული წარმატებული გამოქვეყნება audit log-ში ჩაიწერება. არასრული ფასის ან ტექნიკური მონაცემის მქონე პროდუქტი გამოტოვდება და სიაში მონიშნული დარჩება.</p>
      {selectedProducts.length > selectedDrafts.length ? <p className="mt-2 text-xs text-emerald-900/65">{selectedProducts.length - selectedDrafts.length} უკვე გამოქვეყნებული ან სხვა სტატუსის პროდუქტი უცვლელი დარჩება.</p> : null}
      <p className="mt-3 text-xs leading-5 text-emerald-900/65">{selectedDrafts.slice(0, 4).map((product) => product.name).join(" · ")}{selectedDrafts.length > 4 ? ` · და კიდევ ${selectedDrafts.length - 4}` : ""}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={publicationAction}>
          <input type="hidden" name="confirm_bulk_publication" value="true" />
          {selectedProducts.map((product) => <input key={product.id} type="hidden" name="product_ids" value={product.id} />)}
          <button disabled={publicationPending} className="inline-flex items-center gap-2 rounded-xl bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{publicationPending ? <LoaderCircle size={16} className="animate-spin" /> : <Globe2 size={16} />}{publicationPending ? "ქვეყნდება..." : `დიახ, გამოაქვეყნე ${selectedDrafts.length}`}</button>
        </form>
        <button type="button" disabled={publicationPending} onClick={() => setConfirmingPublication(false)} className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-4 py-2.5 text-sm font-semibold text-emerald-900"><X size={16} />გაუქმება</button>
      </div>
    </section> : null}

    {confirmingDelete && selectedProducts.length ? <section className="rounded-2xl border border-red-200 bg-red-50 p-5 text-red-950">
      <h2 className="font-semibold">ნამდვილად წავშალოთ {selectedProducts.length} პროდუქტი?</h2>
      <p className="mt-2 text-sm leading-6 text-red-900/75">ეს მოქმედება შეუქცევადია. Archived პროდუქტის სატესტო/დასრულებული შეკვეთის snapshot დარჩება, ხოლო მისი Daily Deals კავშირები audit ჩანაწერის შექმნის შემდეგ გასუფთავდება. აქტიური რეალური შეკვეთა კვლავ დაცულია.</p>
      <p className="mt-3 text-xs leading-5 text-red-900/65">{selectedProducts.slice(0, 4).map((product) => product.name).join(" · ")}{selectedProducts.length > 4 ? ` · და კიდევ ${selectedProducts.length - 4}` : ""}</p>
      {deleteState.message && !deleteState.ok ? <p className="mt-3 rounded-xl bg-white/70 px-3 py-2 text-sm text-red-800">{deleteState.message}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">
        <form action={deleteAction}>{selectedProducts.map((product) => <input key={product.id} type="hidden" name="product_ids" value={product.id} />)}<button disabled={deletePending} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{deletePending ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}{deletePending ? "იშლება..." : `დიახ, წაშალე ${selectedProducts.length}`}</button></form>
        <button type="button" disabled={deletePending} onClick={() => setConfirmingDelete(false)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-800"><X size={16} />გაუქმება</button>
      </div>
    </section> : null}

    {deleteState.ok && deleteState.message ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{deleteState.message}</p> : null}

    {publicationState.completed && publicationState.message ? <section className={`rounded-xl border px-4 py-3 text-sm ${publicationState.failures?.length ? "border-amber-200 bg-amber-50 text-amber-950" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}>
      <p className="font-medium">{publicationState.message}</p>
      {publicationState.failures?.length ? <ul className="mt-2 space-y-1 text-xs">{publicationState.failures.slice(0, 10).map((failure) => <li key={failure.productId}>{failure.name} — {failure.message}</li>)}</ul> : null}
      {(publicationState.failures?.length ?? 0) > 10 ? <p className="mt-2 text-xs">და კიდევ {(publicationState.failures?.length ?? 0) - 10} პროდუქტი.</p> : null}
    </section> : null}

    <div className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft"><div className="overflow-x-auto"><table className="w-full min-w-[940px] text-left text-sm"><thead className="bg-hooma-panel text-xs uppercase tracking-[0.14em] text-hooma-muted"><tr>{canSelect ? <th className="w-14 px-5 py-4"><input type="checkbox" aria-label="ყველა პროდუქტის მონიშვნა" checked={allSelected} onChange={toggleAll} className="h-4 w-4 accent-hooma-accent" /></th> : null}<th className="px-5 py-4">პროდუქტი</th><th className="px-5 py-4">კატეგორია</th><th className="px-5 py-4">ტექნიკური</th><th className="px-5 py-4">ფასი</th><th className="px-5 py-4">სტატუსი</th></tr></thead><tbody className="divide-y divide-hooma-text/10">{products.map((product) => <tr key={product.id} className={selected.has(product.id) ? "bg-hooma-accent/5" : undefined}>{canSelect ? <td className="px-5 py-4"><input type="checkbox" aria-label={`${product.name} მონიშვნა`} checked={selected.has(product.id)} onChange={() => toggleProduct(product.id)} className="h-4 w-4 accent-hooma-accent" /></td> : null}<td className="px-5 py-4"><div className="flex flex-wrap items-center gap-2"><Link href={`/admin/products/${product.id}`} className="font-medium hover:text-hooma-accent">{product.name}</Link>{product.auditCompletedAt ? <span title={`აუდიტი დასრულდა: ${new Date(product.auditCompletedAt).toLocaleString("ka-GE")}`} className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-800"><CircleCheck size={12} />აუდიტი გავლილია</span> : null}</div><span className="block text-xs text-hooma-muted">{product.slug}</span></td><td className="px-5 py-4 text-hooma-muted">{product.category}<span className="block text-xs">{product.subcategory}</span></td><td className="px-5 py-4 text-hooma-muted">{product.printMinutes ? `${product.printMinutes} წუთი` : "დრო შესავსებია"}<span className="block text-xs">{product.grams ? `${product.grams} გ` : "წონა შესავსებია"}</span></td><td className="px-5 py-4 font-semibold">{product.price === null ? "—" : `₾${product.price.toFixed(2)}`}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs ${product.status === "active" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100"}`}>{product.status}</span></td></tr>)}</tbody></table></div></div>
  </div>;
}
