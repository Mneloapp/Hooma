"use client";

import { useMemo, useState } from "react";
import { Calculator, LockKeyhole, Save } from "lucide-react";
import { saveMaterialCostAction, savePricingProfileAction } from "@/app/admin/settings/actions";

export type MaterialCostProfile = { id: string; code: string; name: string; cost_per_kg: number; waste_percent: number; is_active: boolean };
export type PricingProfile = { id: string; name: string; machine_hour_cost: number; labor_cost_per_order: number; packaging_cost: number; overhead_percent: number; failure_reserve_percent: number; default_margin_percent: number; vat_percent: number; rounding_step: number; is_default: boolean };

const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL", maximumFractionDigits: 2 });
const inputClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent";

export function CostSettingsEditor({ materials, pricing }: { materials: MaterialCostProfile[]; pricing: PricingProfile | null }) {
  const [materialId, setMaterialId] = useState(materials[0]?.id ?? "");
  const [grams, setGrams] = useState(100);
  const [minutes, setMinutes] = useState(180);
  const [margin, setMargin] = useState(pricing?.default_margin_percent ?? 0);
  const selectedMaterial = materials.find((item) => item.id === materialId);

  const result = useMemo(() => {
    if (!selectedMaterial || !pricing || grams <= 0 || minutes <= 0 || margin < 0 || margin >= 100) return null;
    const materialCost = (grams / 1000) * selectedMaterial.cost_per_kg * (1 + selectedMaterial.waste_percent / 100);
    const machineCost = (minutes / 60) * pricing.machine_hour_cost;
    const direct = materialCost + machineCost + pricing.labor_cost_per_order + pricing.packaging_cost;
    const overhead = direct * pricing.overhead_percent / 100;
    const failureReserve = (direct + overhead) * pricing.failure_reserve_percent / 100;
    const production = direct + overhead + failureReserve;
    const beforeVat = margin ? production / (1 - margin / 100) : production;
    const withVat = beforeVat * (1 + pricing.vat_percent / 100);
    const final = Math.ceil(withVat / pricing.rounding_step) * pricing.rounding_step;
    return { materialCost, machineCost, overhead, failureReserve, production, beforeVat, final };
  }, [selectedMaterial, pricing, grams, minutes, margin]);

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-hooma-text/10 bg-hooma-text p-5 text-white"><LockKeyhole size={20} className="mt-0.5 shrink-0 text-[#c8d8bd]" /><div><h2 className="font-semibold">Admin-only financial data</h2><p className="mt-1 text-sm leading-6 text-white/60">მასალის ფასი, დანაკარგი, საათობრივი ღირებულება, თვითღირებულება და მარჟა საჯარო პროდუქტის API-ში არ იკითხება.</p></div></div>

      <section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft"><h2 className="text-xl font-semibold">მასალის თვითღირებულება</h2><p className="mt-2 text-sm text-hooma-muted">შეიყვანე ერთი კილოგრამის რეალური შესყიდვის ფასი და საშუალო ნარჩენის პროცენტი.</p><div className="mt-5 grid gap-4 lg:grid-cols-2">{materials.map((item) => <form key={item.id} action={saveMaterialCostAction} className="grid gap-3 rounded-2xl border border-hooma-text/10 bg-hooma-background p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><input type="hidden" name="id" value={item.id} /><label className="text-sm font-medium">{item.name} — ₾/კგ<input name="cost_per_kg" type="number" min="0" step="0.01" defaultValue={item.cost_per_kg} className={inputClass} /></label><label className="text-sm font-medium">დანაკარგი %<input name="waste_percent" type="number" min="0" max="100" step="0.01" defaultValue={item.waste_percent} className={inputClass} /></label><button title="შენახვა" className="grid h-11 w-11 place-items-center rounded-xl bg-hooma-text text-white"><Save size={17} /></button></form>)}</div></section>

      {pricing ? <section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft"><h2 className="text-xl font-semibold">წარმოებისა და ფასის პარამეტრები</h2><form action={savePricingProfileAction} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><input type="hidden" name="id" value={pricing.id} />{[
        ["machine_hour_cost", "პრინტერის 1 საათი, ₾", pricing.machine_hour_cost],
        ["labor_cost_per_order", "შრომა თითო შეკვეთაზე, ₾", pricing.labor_cost_per_order],
        ["packaging_cost", "შეფუთვა, ₾", pricing.packaging_cost],
        ["overhead_percent", "ზედნადები ხარჯი, %", pricing.overhead_percent],
        ["failure_reserve_percent", "წარუმატებელი ბეჭდვის რეზერვი, %", pricing.failure_reserve_percent],
        ["default_margin_percent", "საბაზო მოგების მარჟა, %", pricing.default_margin_percent],
        ["vat_percent", "დღგ, %", pricing.vat_percent],
        ["rounding_step", "ფასის დამრგვალება, ₾", pricing.rounding_step],
      ].map(([name, label, value]) => <label key={String(name)} className="text-sm font-medium">{String(label)}<input name={String(name)} type="number" min="0" step="0.01" defaultValue={Number(value)} className={inputClass} /></label>)}<button className="rounded-xl bg-hooma-text px-5 py-3 text-sm font-semibold text-white sm:col-span-2 xl:col-span-4">პარამეტრების შენახვა</button></form></section> : null}

      <section className="rounded-[1.5rem] border border-hooma-accent/20 bg-[#dfe8da] p-6"><div className="flex items-center gap-2"><Calculator size={19} className="text-hooma-accent" /><h2 className="text-xl font-semibold">ფასის კალკულატორი</h2></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium">მასალა<select value={materialId} onChange={(event) => setMaterialId(event.target.value)} className={inputClass}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">წონა, გრამი<input type="number" min="1" value={grams} onChange={(event) => setGrams(Number(event.target.value))} className={inputClass} /></label><label className="text-sm font-medium">ბეჭდვის დრო, წუთი<input type="number" min="1" value={minutes} onChange={(event) => setMinutes(Number(event.target.value))} className={inputClass} /></label><label className="text-sm font-medium">მარჟა, %<input type="number" min="0" max="99.99" step="0.01" value={margin} onChange={(event) => setMargin(Number(event.target.value))} className={inputClass} /></label></div>{result ? <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[["მასალა", result.materialCost], ["პრინტერის დრო", result.machineCost], ["ზედნადები", result.overhead], ["ბეჭდვის რეზერვი", result.failureReserve], ["სრული თვითღირებულება", result.production], ["ფასი დღგ-მდე", result.beforeVat]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-white/70 p-4"><p className="text-xs text-hooma-muted">{String(label)}</p><p className="mt-2 font-semibold">{money.format(Number(value))}</p></div>)}<div className="rounded-xl bg-hooma-text p-4 text-white sm:col-span-2"><p className="text-xs text-white/55">საბოლოო გასაყიდი ფასი</p><p className="mt-2 text-3xl font-bold">{money.format(result.final)}</p></div></div> : <p className="mt-5 text-sm text-hooma-muted">შეავსე პარამეტრები კალკულაციისთვის.</p>}<p className="mt-4 text-xs leading-5 text-hooma-muted">მარჟა ითვლება გასაყიდი ფასიდან და არა თვითღირებულებაზე უბრალო დამატებით.</p></section>
    </div>
  );
}
