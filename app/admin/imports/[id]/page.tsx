import Link from "next/link";
import { AlertTriangle, ArrowLeft, ExternalLink, ImageIcon } from "lucide-react";
import { notFound } from "next/navigation";
import { ImportReviewForm } from "@/components/admin/ImportReviewForm";
import type { MaterialCostProfile, PricingProfile } from "@/components/admin/CostSettingsEditor";
import { createClient } from "@/lib/supabase/server";

export default async function ImportReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = (await createClient()) as any;
  if (!supabase) notFound();
  const [importResult, categoryResult, materialResult, pricingResult] = await Promise.all([
    supabase.from("source_imports").select("*").eq("id", id).maybeSingle(),
    supabase.from("categories").select("id,parent_id,name_ka,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("material_cost_profiles").select("*").eq("is_active", true).order("code"),
    supabase.from("pricing_profiles").select("*").eq("is_default", true).maybeSingle(),
  ]);
  const item = importResult.data as any;
  if (!item) notFound();
  const parents = new Map<string, string>((categoryResult.data ?? []).filter((row: any) => !row.parent_id).map((row: any) => [row.id, row.name_ka]));
  const categories = (categoryResult.data ?? []).map((row: any) => ({ id: row.id, name: row.parent_id ? `${parents.get(row.parent_id) ?? "კატეგორია"} → ${row.name_ka}` : row.name_ka }));
  const metadata = item.extracted_metadata ?? {};
  const images = Array.isArray(metadata.images) ? metadata.images.filter((value: unknown) => typeof value === "string" && value.startsWith("https://")).slice(0, 12) : [];
  const defaultName = item.source_title || `${item.platform || "Source"} ${item.source_model_id ?? "product"}`;
  const slugPart = String(item.source_model_id ?? item.id.slice(0, 8)).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || item.id.slice(0, 8);
  const defaultSlug = `${item.platform || "source"}-${slugPart}`.toLowerCase();
  const pricing = pricingResult.data as PricingProfile | null;

  return <div className="space-y-6"><Link href="/admin/imports" className="inline-flex items-center gap-2 text-sm text-hooma-muted"><ArrowLeft size={15} />Import queue</Link><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[0.25em] text-hooma-muted">Source review</p><h1 className="mt-3 text-4xl font-semibold">{defaultName}</h1><p className="mt-2 text-sm text-hooma-muted">{item.platform} · Model ID: {item.source_model_id ?? "—"} · Status: {item.status}</p></div><a href={item.source_url} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-full border border-hooma-text/10 bg-white px-4 py-2.5 text-sm">წყაროს გახსნა<ExternalLink size={14} /></a></div>
    {item.status === "needs_review" ? <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-amber-950"><AlertTriangle size={20} className="mt-0.5 shrink-0" /><div><h2 className="font-semibold">ბმული შენახულია — საჭიროა ოპერატორის შევსება</h2><p className="mt-1 text-sm leading-6 text-amber-900/75">წყაროს პლატფორმამ სერვერის ავტომატური წაკითხვა შეზღუდა. გახსენი წყარო ახალ ჩანართში და ქვემოთ შეავსე დარჩენილი მონაცემები.</p></div></div> : null}
    <section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft"><h2 className="text-xl font-semibold">ავტომატურად მიღებული მონაცემები</h2><p className="mt-3 max-w-4xl text-sm leading-7 text-hooma-muted">{metadata.description || item.error_message || "აღწერა ავტომატურად ვერ მოიძებნა."}</p><div className="mt-5 flex gap-3 overflow-x-auto pb-2">{images.length ? images.map((image: string) => <div key={image} className="h-36 w-48 shrink-0 rounded-xl bg-hooma-panel bg-cover bg-center" style={{ backgroundImage: `url("${image.replace(/["\\\n\r]/g, "")}")` }} />) : <div className="grid h-36 w-full place-items-center rounded-xl bg-hooma-panel text-hooma-muted"><ImageIcon size={24} /></div>}</div><p className="mt-3 text-xs text-hooma-muted">სურათები წყაროს preview-ბმულებიდან იტვირთება.</p></section>
    {pricing ? <ImportReviewForm importId={id} sourceUrl={item.source_url} sourceModelId={item.source_model_id} defaultName={defaultName} defaultSlug={defaultSlug} defaultDescription={typeof metadata.description === "string" ? metadata.description : ""} defaultImages={images} categories={categories} materials={(materialResult.data ?? []) as MaterialCostProfile[]} pricing={pricing} /> : <div className="rounded-xl bg-amber-50 p-5 text-sm text-amber-900">ჯერ შეავსე Admin → Settings-ის ფასის პარამეტრები და გაუშვი ბოლო migration.</div>}
  </div>;
}
