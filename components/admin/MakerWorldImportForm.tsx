"use client";

import Link from "next/link";
import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Link2, LoaderCircle } from "lucide-react";
import { createMakerWorldImportAction } from "@/app/admin/imports/actions";

export function MakerWorldImportForm() {
  const [state, action, pending] = useActionState(createMakerWorldImportAction, {});
  const router = useRouter();

  useEffect(() => {
    if (state.ok && state.importId) router.push(`/admin/imports/${state.importId}`);
  }, [router, state.importId, state.ok]);

  return (
    <form action={action} className="rounded-[2rem] bg-white/75 p-6 shadow-soft">
      <label className="text-sm font-medium">MakerWorld პროდუქტის ბმული
        <div className="mt-2 flex rounded-2xl border border-hooma-text/10 bg-white p-1 focus-within:border-hooma-accent">
          <span className="grid h-11 w-11 shrink-0 place-items-center text-hooma-muted"><Link2 size={18} /></span>
          <input name="source_url" type="url" required placeholder="https://makerworld.com/en/models/..." className="min-w-0 flex-1 bg-transparent px-2 text-sm outline-none" />
          <button disabled={pending} className="flex items-center gap-2 rounded-xl bg-hooma-text px-5 text-sm font-medium text-white disabled:opacity-50">{pending ? <><LoaderCircle size={16} className="animate-spin" />ბმული ინახება...</> : "Draft-ის შექმნა"}</button>
        </div>
      </label>
      {state.message ? <div className={`mt-4 rounded-xl p-4 text-sm leading-6 ${state.ok ? "bg-[#dfe8da] text-hooma-text" : "bg-red-50 text-red-800"}`}>{state.message}{state.importId ? <Link href={`/admin/imports/${state.importId}`} className="ml-2 font-semibold underline">გადამოწმებაზე გადასვლა</Link> : null}</div> : null}
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {["სახელი, აღწერა და ფოტო-ბმულები", "ავტორი და წყაროს ID", "ლიცენზიის ხელით დადასტურება", "3MF/პროფილის ტექნიკური მონაცემები", "მასალა, წონა და ბეჭდვის დრო", "კატეგორია, ფასი და გამოქვეყნება"].map((item, index) => <div key={item} className="flex items-center gap-3 rounded-2xl bg-hooma-panel/70 p-4 text-sm"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-xs font-semibold">{index + 1}</span>{item}</div>)}
      </div>
    </form>
  );
}
