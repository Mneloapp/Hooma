import { HoomaProductForm } from "@/components/admin/HoomaProductForm";
import type { MaterialCostProfile, PricingProfile } from "@/components/admin/CostSettingsEditor";
import { catalogCategories } from "@/data/catalog";
import { buildCategoryOptions, type CategoryRow } from "@/lib/catalog-categories";
import { createClient } from "@/lib/supabase/server";

export default async function NewProductPage() {
  const supabase = (await createClient()) as any;
  const [categoryResult, materialResult, pricingResult] = supabase ? await Promise.all([
    supabase.from("categories").select("id,parent_id,slug,name_en,name_ka,sort_order").eq("is_active", true).order("sort_order"),
    supabase.from("material_cost_profiles").select("*").eq("is_active", true).order("code"),
    supabase.from("pricing_profiles").select("*").eq("is_default", true).maybeSingle(),
  ]) : [{ data: [] }, { data: [] }, { data: null }];
  const expectedCategorySlugs = catalogCategories.flatMap((category) => [
    category.slug,
    ...category.subcategories.map((subcategory) => subcategory.slug),
  ]);
  const expectedCategorySet = new Set(expectedCategorySlugs);
  const activeCategoryRows = ((categoryResult.data ?? []) as CategoryRow[])
    .filter((category) => expectedCategorySet.has(category.slug));
  const activeCategorySlugs = new Set(activeCategoryRows.map((category) => category.slug));
  const missingCategoryCount = expectedCategorySlugs.filter((slug) => !activeCategorySlugs.has(slug)).length;
  const categoryTreeReady = !categoryResult.error && missingCategoryCount === 0;
  const categories = buildCategoryOptions(activeCategoryRows);
  const pricing = pricingResult.data as PricingProfile | null;

  return <div className="space-y-6"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Catalog</p><h1 className="mt-3 text-4xl font-medium">ახალი პროდუქტის დამატება</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">ყველა მონაცემი შეიყვანე ხელით. SKU და გასაყიდი ფასი სერვერზე ავტომატურად შეიქმნება, პროდუქტი კი ჯერ Draft-ში შეინახება.</p></div>
    <section className="rounded-[2rem] bg-white/75 p-6 shadow-soft"><h2 className="text-xl font-semibold">პროდუქტის მონაცემები</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">Draft-ის შექმნის შემდეგ პროდუქტის გვერდზე გადაამოწმებ შედეგს და ცალკე ღილაკით გამოაქვეყნებ.</p>{!categoryTreeReady ? <div className="mt-6 rounded-xl bg-amber-50 p-5 text-sm leading-6 text-amber-950"><strong className="block">ახალი კატეგორიების migration ჯერ Supabase-ში არ არის გამოყენებული.</strong><span className="mt-1 block">ძველი კატეგორიები განზრახ აღარ გამოჩნდება. Hooma-ს ტერმინალში გაუშვი <code className="rounded bg-amber-100 px-1.5 py-0.5">supabase db push --linked</code> — აკლია {missingCategoryCount} კატეგორია/ქვეკატეგორია migration-იდან <code className="rounded bg-amber-100 px-1.5 py-0.5">20260716000100_makerworld_category_tree.sql</code>.</span></div> : pricing ? <HoomaProductForm categories={categories} materials={(materialResult.data ?? []) as MaterialCostProfile[]} pricing={pricing} /> : <div className="mt-6 rounded-xl bg-amber-50 p-5 text-sm text-amber-900">ჯერ შეავსე Admin → Settings-ის ფასის პარამეტრები და გაუშვი ბოლო migration.</div>}</section>
  </div>;
}
