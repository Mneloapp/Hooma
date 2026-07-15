import Link from "next/link";
import { HoomaProductForm } from "@/components/admin/HoomaProductForm";
import type { MaterialCostProfile, PricingProfile } from "@/components/admin/CostSettingsEditor";
import { createClient } from "@/lib/supabase/server";

export default async function NewProductPage() {
  const supabase = (await createClient()) as any;
  const [categoryResult, materialResult, pricingResult] = supabase ? await Promise.all([
    supabase.from("categories").select("id,parent_id,name_ka,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("material_cost_profiles").select("*").eq("is_active", true).order("code"),
    supabase.from("pricing_profiles").select("*").eq("is_default", true).maybeSingle(),
  ]) : [{ data: [] }, { data: [] }, { data: null }];
  const parents = new Map<string, string>((categoryResult.data ?? []).filter((row: any) => !row.parent_id).map((row: any) => [row.id, row.name_ka]));
  const categories = (categoryResult.data ?? []).map((row: any) => ({ id: row.id, name: row.parent_id ? `${parents.get(row.parent_id) ?? "კატეგორია"} → ${row.name_ka}` : row.name_ka }));
  const pricing = pricingResult.data as PricingProfile | null;

  return <div className="space-y-6"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog</p><h1 className="mt-3 text-4xl font-medium">ახალი პროდუქტის დამატება</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">შექმენი Hooma-ს პროდუქტის Draft, მიუთითე ტექნიკური პროფილი და სისტემა ფასს ავტომატურად დაითვლის.</p></div><Link href="/admin/imports" className="rounded-full border border-hooma-text/10 bg-white px-5 py-3 text-sm font-medium">უნივერსალური იმპორტი</Link></div>
    <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft"><h2 className="text-xl font-semibold">Hooma პროდუქტი</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">პროდუქტი ჯერ Draft-ად შეინახება. შექმნის შემდეგ გახსენი, გადაამოწმე ფასი და გამოაქვეყნე.</p>{pricing ? <HoomaProductForm categories={categories} materials={(materialResult.data ?? []) as MaterialCostProfile[]} pricing={pricing} /> : <div className="mt-6 rounded-xl bg-amber-50 p-5 text-sm text-amber-900">ჯერ შეავსე Admin → Settings-ის ფასის პარამეტრები და გაუშვი ბოლო migration.</div>}</section>
  </div>;
}
