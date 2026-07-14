"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2, X } from "lucide-react";
import { deleteProductDraftAction } from "@/app/admin/products/actions";

export function DeleteProductButton({ productId, productName }: { productId: string; productName: string }) {
  const [confirming, setConfirming] = useState(false);
  const [state, action, pending] = useActionState(deleteProductDraftAction, {});
  const router = useRouter();

  useEffect(() => {
    if (!state.ok) return;
    router.push("/admin/products");
    router.refresh();
  }, [router, state.ok]);

  if (!confirming) {
    return <button type="button" onClick={() => setConfirming(true)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-3 text-sm font-semibold text-red-700"><Trash2 size={16} />Draft-ის წაშლა</button>;
  }

  return <div className="rounded-2xl border border-red-200 bg-red-50 p-4"><p className="text-sm font-semibold text-red-950">ნამდვილად წავშალოთ „{productName}“?</p><p className="mt-1 text-xs leading-5 text-red-800">პროდუქტის Draft, ვარიანტები, ფასი და წყაროს კავშირი წაიშლება. Import ჩანაწერი დარჩება და თავიდან გამოყენება შესაძლებელი იქნება.</p>{state.message && !state.ok ? <p className="mt-3 text-sm text-red-800">{state.message}</p> : null}<div className="mt-4 flex flex-wrap gap-2"><form action={action}><input type="hidden" name="product_id" value={productId} /><button disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Trash2 size={16} />}{pending ? "იშლება..." : "დიახ, წაშლა"}</button></form><button type="button" disabled={pending} onClick={() => setConfirming(false)} className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-800"><X size={16} />გაუქმება</button></div></div>;
}
