import { CostSettingsEditor, type MaterialCostProfile, type PricingProfile } from "@/components/admin/CostSettingsEditor";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AdminSettingsPage() {
  const supabase = (await createClient()) as any;
  const [materialsResult, pricingResult] = supabase ? await Promise.all([
    supabase.from("material_cost_profiles").select("*").eq("is_active", true).order("code"),
    supabase.from("pricing_profiles").select("*").eq("is_default", true).maybeSingle(),
  ]) : [{ data: [], error: null }, { data: null, error: null }];
  const setupMissing = Boolean(materialsResult.error || pricingResult.error);

  return <div className="space-y-6"><div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Costing & pricing</p><h1 className="mt-3 text-4xl font-medium">თვითღირებულება და ფასები</h1><p className="mt-3 max-w-3xl text-sm leading-6 text-hooma-muted">აქ განსაზღვრავ მასალის, პრინტერის დროის, შრომის, შეფუთვის, დანაკარგის, მარჟისა და დღგ-ის წესებს. მომხმარებელი ამ მონაცემებს ვერ ხედავს.</p></div>{setupMissing ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">Costing სისტემა ჯერ არ არის გააქტიურებული — გაუშვი ბოლო Supabase migration.</div> : <CostSettingsEditor materials={(materialsResult.data ?? []) as MaterialCostProfile[]} pricing={(pricingResult.data as PricingProfile | null) ?? null} />}</div>;
}
