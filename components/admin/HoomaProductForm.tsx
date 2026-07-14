"use client";

import Link from "next/link";
import { useActionState } from "react";
import { CheckCircle2 } from "lucide-react";
import { createHoomaProductAction } from "@/app/admin/products/new/actions";
import type { MaterialCostProfile, PricingProfile } from "@/components/admin/CostSettingsEditor";

type CategoryOption = { id: string; name: string };
const inputClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent";

export function HoomaProductForm({ categories, materials, pricing }: { categories: CategoryOption[]; materials: MaterialCostProfile[]; pricing: PricingProfile }) {
  const [state, action, pending] = useActionState(createHoomaProductAction, {});

  return <form action={action} className="mt-6 space-y-6"><input type="hidden" name="pricing_profile_id" value={pricing.id} />
    <section className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">ქართული სახელი<input name="name_ka" required className={inputClass} /></label><label className="text-sm font-medium">ინგლისური სახელი<input name="name_en" required className={inputClass} /></label><label className="text-sm font-medium">Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="მაგ. desk-organizer" className={inputClass} /></label><label className="text-sm font-medium">კატეგორია / ქვეკატეგორია<select name="category_id" required className={inputClass}><option value="">აირჩიე</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium sm:col-span-2">ქართული აღწერა<textarea name="description" rows={4} maxLength={3000} className={inputClass} /></label></section>

    <section className="rounded-2xl bg-hooma-panel/70 p-5"><h3 className="font-semibold">ტექნიკური პროფილი და ფასი</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium">მასალა<select name="material_profile_id" required className={inputClass}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">წონა, გრამი<input name="material_grams" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">ბეჭდვის დრო, წუთი<input name="print_minutes" type="number" min="1" required className={inputClass} /></label><label className="text-sm font-medium">ფირფიტების რაოდენობა<input name="plate_count" type="number" min="1" max="100" defaultValue="1" required className={inputClass} /></label><label className="text-sm font-medium">X ზომა, მმ<input name="dimension_x" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">Y ზომა, მმ<input name="dimension_y" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">Z ზომა, მმ<input name="dimension_z" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">მოგების მარჟა, %<input name="margin_percent" type="number" min="0" max="99.99" step="0.01" defaultValue={pricing.default_margin_percent} required className={inputClass} /></label></div></section>

    {state.message ? <div className={`rounded-xl p-4 text-sm ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{state.ok ? <CheckCircle2 size={16} className="mr-2 inline" /> : null}{state.message}{state.productId ? <Link href={`/admin/products/${state.productId}`} className="ml-2 font-semibold underline">პროდუქტის გახსნა</Link> : null}</div> : null}
    <button disabled={pending || !materials.length || !categories.length} className="w-full rounded-xl bg-hooma-text px-6 py-4 font-semibold text-white disabled:opacity-45">{pending ? "Draft იქმნება..." : "Hooma პროდუქტის Draft-ის შექმნა"}</button>
  </form>;
}
