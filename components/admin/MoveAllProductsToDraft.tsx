"use client";

import { useActionState, useEffect, useState } from "react";
import { ArchiveRestore, LoaderCircle, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { moveAllCatalogProductsToDraftAction } from "@/app/admin/products/actions";

export function MoveAllProductsToDraft({ nonDraftCount }: { nonDraftCount: number }) {
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [state, action, pending] = useActionState(moveAllCatalogProductsToDraftAction, {});
  const router = useRouter();

  useEffect(() => {
    if (!state.ok) return;
    setOpen(false);
    setConfirmation("");
    router.refresh();
  }, [router, state.ok]);

  return (
    <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-amber-950">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
        <div>
          <div className="flex items-center gap-2">
            <ArchiveRestore size={18} />
            <h2 className="font-semibold">ყველა პროდუქტის Draft-ზე გადაყვანა</h2>
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-amber-900/75">
            Active და Archived პროდუქტები ერთიანად გახდება Draft და საჯარო კატალოგიდან მოიხსნება.
            აუდიტის დამტკიცების ისტორია არ წაიშლება, ამიტომ დამტკიცებული პროდუქტები ცალკე გვერდზე დარჩება.
          </p>
        </div>
        <button
          type="button"
          disabled={!nonDraftCount || pending}
          onClick={() => setOpen((current) => !current)}
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-amber-950 px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
        >
          <ArchiveRestore size={16} />
          {nonDraftCount ? `${nonDraftCount.toLocaleString("ka-GE")} პროდუქტის Draft-ზე გადაყვანა` : "ყველა უკვე Draft-ია"}
        </button>
      </div>

      {open ? (
        <form action={action} className="mt-5 rounded-xl border border-amber-300 bg-white/75 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-semibold">დაადასტურე მასობრივი ცვლილება</p>
              <p className="mt-1 text-xs leading-5 text-amber-900/70">
                ჩაწერე <strong>DRAFT</strong>. მოქმედება სტატუსს შეცვლის ყველა არა-Draft პროდუქტზე.
              </p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="დახურვა" className="rounded-lg p-2 hover:bg-amber-100">
              <X size={16} />
            </button>
          </div>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              name="confirmation"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              autoComplete="off"
              placeholder="DRAFT"
              className="min-h-11 flex-1 rounded-xl border border-amber-300 bg-white px-4 outline-none focus:border-amber-700"
            />
            <button
              disabled={pending || confirmation.trim().toUpperCase() !== "DRAFT"}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-red-700 px-5 text-sm font-semibold text-white disabled:opacity-40"
            >
              {pending ? <LoaderCircle size={16} className="animate-spin" /> : <ArchiveRestore size={16} />}
              {pending ? "მუშავდება..." : "ყველა პროდუქტი Draft-ზე"}
            </button>
          </div>
        </form>
      ) : null}

      {state.message ? (
        <p role="status" className={`mt-4 rounded-xl px-4 py-3 text-sm ${state.ok ? "bg-emerald-100 text-emerald-900" : "bg-red-100 text-red-900"}`}>
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
