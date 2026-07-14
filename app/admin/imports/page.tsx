import Link from "next/link";
import { ArrowRight, ImageIcon, ShieldCheck } from "lucide-react";
import { MakerWorldImportForm } from "@/components/admin/MakerWorldImportForm";
import { createClient } from "@/lib/supabase/server";

type ImportRow = {
  id: string;
  source_url: string;
  source_title: string | null;
  source_model_id: string | null;
  status: string;
  extracted_metadata: { description?: string; images?: string[] } | null;
  error_message: string | null;
  created_at: string;
};

const statusStyle: Record<string, string> = {
  metadata_ready: "bg-emerald-100 text-emerald-800",
  needs_review: "bg-amber-100 text-amber-800",
  approved: "bg-blue-100 text-blue-800",
  failed: "bg-red-100 text-red-800",
  submitted: "bg-slate-100 text-slate-700",
};

export default async function ImportInboxPage() {
  const supabase = (await createClient()) as any;
  const { data, error } = supabase
    ? await supabase.from("source_imports").select("id,source_url,source_title,source_model_id,status,extracted_metadata,error_message,created_at").order("created_at", { ascending: false }).limit(50)
    : { data: [], error: null };
  const imports = (data ?? []) as ImportRow[];

  return (
    <div className="space-y-6">
      <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog sources</p><h1 className="mt-3 text-4xl font-medium">MakerWorld Import</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">ჩასვი პროდუქტის ბმული — Hooma შექმნის მონახაზს, წამოიღებს საჯარო metadata-ს და დაგიტოვებს მხოლოდ გადამოწმებას, ტექნიკურ პროფილსა და ფასს.</p></div>
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        <MakerWorldImportForm />
        <aside className="space-y-4">
          <div className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-5"><ShieldCheck size={20} className="text-hooma-accent" /><h2 className="mt-5 font-semibold">ადმინისტრატორის კონტროლი</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">ავტომატიზაცია ქმნის Draft-ს. კატეგორიას, დამზადებადობას, თვითღირებულებას, მარჟასა და გამოქვეყნებას ადასტურებს ადმინისტრატორი.</p></div>
        </aside>
      </div>

      <section className="overflow-hidden rounded-[1.5rem] bg-white/75 shadow-soft">
        <div className="flex items-center justify-between border-b border-hooma-text/10 px-6 py-5"><h2 className="font-semibold">Import queue</h2><span className="rounded-full bg-hooma-panel px-3 py-1 text-xs">{imports.length}</span></div>
        {error ? <div className="m-6 rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Import ცხრილი ჯერ არ არის მზად. გაუშვი ბოლო Supabase migration.</div> : null}
        {!error && imports.length ? <div className="divide-y divide-hooma-text/10">{imports.map((item) => {
          const image = item.extracted_metadata?.images?.[0]?.startsWith("https://") ? item.extracted_metadata.images[0].replace(/["\\\n\r]/g, "") : null;
          return <article key={item.id} className="grid gap-4 p-5 sm:grid-cols-[96px_1fr_auto] sm:items-center">
            <div className="relative h-24 overflow-hidden rounded-xl bg-hooma-panel">{image ? <div aria-label="Imported product preview" className="h-full w-full bg-cover bg-center" style={{ backgroundImage: `url("${image}")` }} /> : <div className="grid h-full place-items-center text-hooma-muted"><ImageIcon size={21} /></div>}</div>
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{item.source_title || "უსახელო MakerWorld მონახაზი"}</h3><span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase ${statusStyle[item.status] ?? statusStyle.submitted}`}>{item.status}</span></div><p className="mt-1 text-xs text-hooma-muted">Model ID: {item.source_model_id ?? "—"} · {new Date(item.created_at).toLocaleDateString("ka-GE")}</p>{item.error_message ? <p className="mt-2 line-clamp-2 text-xs text-amber-800">{item.error_message}</p> : <p className="mt-2 line-clamp-2 text-sm text-hooma-muted">{item.extracted_metadata?.description || item.source_url}</p>}</div>
            <Link href={`/admin/imports/${item.id}`} className="flex items-center gap-2 rounded-full border border-hooma-text/10 px-4 py-2.5 text-sm font-medium">გადამოწმება<ArrowRight size={15} /></Link>
          </article>;
        })}</div> : null}
        {!error && !imports.length ? <div className="flex flex-col items-center px-6 py-16 text-center"><div className="grid h-12 w-12 place-items-center rounded-2xl bg-hooma-panel"><ArrowRight size={19} /></div><p className="mt-5 font-medium">ჯერ არცერთი ბმული არ დაგიმატებია</p><p className="mt-2 text-sm text-hooma-muted">პირველი MakerWorld პროდუქტის ბმული ზემოთ ჩასვი.</p></div> : null}
      </section>
    </div>
  );
}
