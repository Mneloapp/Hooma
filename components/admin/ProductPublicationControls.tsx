"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Eye, EyeOff, LoaderCircle, PauseCircle, ShieldCheck } from "lucide-react";
import { setProductProductionApprovalAction, setProductPublicationAction } from "@/app/admin/products/actions";

function Result({ state }: { state: { ok?: boolean; message?: string } }) {
  return state.message ? <p aria-live="polite" className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : null;
}

export function ProductPublicationControls({ productId, status, productionStatus, priceReady }: { productId: string; status: string; productionStatus: string; priceReady: boolean }) {
  const [productionState, productionAction, productionPending] = useActionState(setProductProductionApprovalAction, {});
  const [publicationState, publicationAction, publicationPending] = useActionState(setProductPublicationAction, {});
  const router = useRouter();

  useEffect(() => {
    if (productionState.ok || publicationState.ok) router.refresh();
  }, [publicationState.ok, productionState.ok, router]);

  const productionReady = productionStatus === "approved";
  const published = status === "active";

  return <section className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-6 shadow-soft"><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-hooma-accent" /><h2 className="text-xl font-semibold">Owner-ის გამოქვეყნების მართვა</h2></div><p className="mt-2 text-sm leading-6 text-hooma-muted">პროდუქტი Draft-ად რჩება, სანამ შენ ცალკე არ დაადასტურებ წარმოებას და არ დააჭერ გამოქვეყნებას.</p>
    <div className="mt-6 grid gap-4 lg:grid-cols-2"><form action={productionAction} className="rounded-2xl bg-hooma-panel/70 p-5"><input type="hidden" name="product_id" value={productId} /><input type="hidden" name="approved" value={productionReady ? "false" : "true"} /><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">1. წარმოების გადაწყვეტილება</h3><span className={`rounded-full px-3 py-1 text-xs ${productionReady ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{productionStatus}</span></div><p className="mt-2 text-sm leading-6 text-hooma-muted">დაადასტურე მასალის, წონის, დროის, ფასისა და სატესტო ბეჭდვის მზადყოფნა.</p><button disabled={productionPending} className="mt-4 inline-flex items-center gap-2 rounded-xl bg-hooma-text px-4 py-3 text-sm font-semibold text-white disabled:opacity-60">{productionPending ? <LoaderCircle size={16} className="animate-spin" /> : productionReady ? <PauseCircle size={16} /> : <CheckCircle2 size={16} />}{productionReady ? "წარმოების შეჩერება" : "წარმოების დამტკიცება"}</button><Result state={productionState} /></form>
      <form action={publicationAction} className={`rounded-2xl p-5 ${published ? "bg-emerald-950 text-white" : "bg-hooma-panel/70"}`}><input type="hidden" name="product_id" value={productId} /><input type="hidden" name="publish" value={published ? "false" : "true"} /><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">2. საბოლოო გადაწყვეტილება</h3><span className={`rounded-full px-3 py-1 text-xs ${published ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>{status}</span></div><div className={`mt-3 grid grid-cols-2 gap-2 text-center text-xs ${published ? "text-white/70" : "text-hooma-muted"}`}><span>ფასი<br /><strong>{priceReady ? "✓" : "—"}</strong></span><span>წარმოება<br /><strong>{productionReady ? "✓" : "—"}</strong></span></div><button disabled={publicationPending || (!published && (!priceReady || !productionReady))} className={`mt-4 inline-flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold disabled:opacity-40 ${published ? "bg-white text-emerald-950" : "bg-hooma-accent text-white"}`}>{publicationPending ? <LoaderCircle size={16} className="animate-spin" /> : published ? <EyeOff size={16} /> : <Eye size={16} />}{published ? "გამოქვეყნებიდან მოხსნა" : "პროდუქტის გამოქვეყნება"}</button><Result state={publicationState} /></form></div>
  </section>;
}
