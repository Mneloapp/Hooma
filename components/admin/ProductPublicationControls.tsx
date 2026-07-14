"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { setProductPublicationAction } from "@/app/admin/products/actions";

function Result({ state }: { state: { ok?: boolean; message?: string } }) {
  return state.message ? <p aria-live="polite" className={`mt-3 text-sm ${state.ok ? "text-emerald-700" : "text-red-700"}`}>{state.message}</p> : null;
}

export function ProductPublicationControls({ productId, status, priceReady }: { productId: string; status: string; priceReady: boolean }) {
  const [publicationState, publicationAction, publicationPending] = useActionState(setProductPublicationAction, {});
  const router = useRouter();

  useEffect(() => {
    if (publicationState.ok) router.refresh();
  }, [publicationState.ok, router]);

  const published = status === "active";

  return <form action={publicationAction} className={`rounded-[1.5rem] border p-6 shadow-soft ${published ? "border-emerald-950 bg-emerald-950 text-white" : "border-hooma-text/10 bg-white/75"}`}><input type="hidden" name="product_id" value={productId} /><input type="hidden" name="publish" value={published ? "false" : "true"} /><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center"><div><div className="flex items-center gap-3"><h2 className="text-xl font-semibold">პროდუქტის გამოქვეყნება</h2><span className={`rounded-full px-3 py-1 text-xs ${published ? "bg-white/15 text-white" : "bg-slate-100 text-slate-700"}`}>{status}</span></div><p className={`mt-2 text-sm leading-6 ${published ? "text-white/65" : "text-hooma-muted"}`}>{published ? "პროდუქტი საჯარო კატალოგში ჩანს." : "Admin-ს ან Owner-ს შეუძლია პროდუქტის პირდაპირ გამოქვეყნება."}</p></div><button disabled={publicationPending || (!published && !priceReady)} className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold disabled:opacity-40 ${published ? "bg-white text-emerald-950" : "bg-hooma-accent text-white"}`}>{publicationPending ? <LoaderCircle size={16} className="animate-spin" /> : published ? <EyeOff size={16} /> : <Eye size={16} />}{published ? "გამოქვეყნებიდან მოხსნა" : "გამოქვეყნება"}</button></div><Result state={publicationState} />
  </form>;
}
