"use client";

import { useActionState, useState } from "react";
import { Layers3, LoaderCircle, Palette, Save } from "lucide-react";
import { updateProductDraftAction } from "@/app/admin/products/actions";
import { useCatalogPricePreview } from "@/components/admin/useCatalogPricePreview";
import { productColorOptions } from "@/data/product-colors";
import type { CategoryOption } from "@/lib/catalog-categories";

type MaterialOption = { id: string; code: string; name: string };
type DraftValues = {
  id: string;
  name: string;
  description: string;
  categoryId: string;
  materialProfileId: string;
  pricingProfileId: string;
  materialGrams: number;
  printMinutes: number;
  marginPercent: number;
  operatorReference: string;
  colorMode: "customer_choice" | "fixed_multicolor";
  colors: string[];
};

const inputClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-4 py-3 text-sm outline-none focus:border-hooma-accent";

export function DraftProductEditor({
  initial,
  categories,
  materials,
}: {
  initial: DraftValues;
  categories: CategoryOption[];
  materials: MaterialOption[];
}) {
  const [state, action, pending] = useActionState(updateProductDraftAction, {});
  const [materialProfileId, setMaterialProfileId] = useState(initial.materialProfileId);
  const [materialGrams, setMaterialGrams] = useState(String(initial.materialGrams));
  const [printHours, setPrintHours] = useState(String(Math.floor(initial.printMinutes / 60)));
  const [printMinutes, setPrintMinutes] = useState(String(initial.printMinutes % 60));
  const [marginPercent, setMarginPercent] = useState(String(initial.marginPercent));
  const [colorMode, setColorMode] = useState(initial.colorMode);
  const hours = Number(printHours);
  const minutes = Number(printMinutes);
  const totalPrintMinutes = Number.isInteger(hours) && Number.isInteger(minutes) && hours >= 0 && minutes >= 0 && minutes <= 59
    ? hours * 60 + minutes
    : 0;
  const price = useCatalogPricePreview({
    materialProfileId,
    pricingProfileId: initial.pricingProfileId,
    materialGrams,
    printMinutes: totalPrintMinutes,
    marginPercent,
  });

  return (
    <form action={action} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-6 shadow-soft">
      <input type="hidden" name="product_id" value={initial.id} />
      <input type="hidden" name="pricing_profile_id" value={initial.pricingProfileId} />
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Draft editor</p>
          <h2 className="mt-2 text-xl font-semibold">პროდუქტის მონაცემების რედაქტირება</h2>
          <p className="mt-2 text-sm leading-6 text-hooma-muted">შეცვალე Clipper-იდან მიღებული ინფორმაცია. შენახვისას თვითღირებულება და გასაყიდი ფასი თავიდან დაითვლება.</p>
        </div>
        <button disabled={pending || price.loading} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-hooma-text px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">
          {pending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}
          {pending ? "ინახება..." : "ცვლილებების შენახვა"}
        </button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">სახელი<input name="name" required minLength={2} maxLength={160} defaultValue={initial.name} className={inputClass} /></label>
        <label className="text-sm font-medium">კატეგორია და ქვეკატეგორია<select name="category_id" required defaultValue={initial.categoryId} className={inputClass}>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium sm:col-span-2">აღწერა<textarea name="description" required minLength={10} maxLength={3000} rows={5} defaultValue={initial.description} className={inputClass} /></label>
        <label className="text-sm font-medium sm:col-span-2">ოპერატორის რეფერენსი <span className="font-normal text-hooma-muted">— მომხმარებელს არ უჩანს</span><textarea name="operator_reference" required minLength={3} maxLength={2000} rows={3} defaultValue={initial.operatorReference} className={inputClass} /></label>
      </div>

      <div className="mt-6 grid gap-4 border-t border-hooma-text/10 pt-6 sm:grid-cols-2 xl:grid-cols-5">
        <label className="text-sm font-medium">მასალა<select name="material_profile_id" required value={materialProfileId} onChange={(event) => setMaterialProfileId(event.target.value)} className={inputClass}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="text-sm font-medium">წონა, გრამი<input name="material_grams" type="number" min="0.01" step="0.01" required value={materialGrams} onChange={(event) => setMaterialGrams(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">ბეჭდვის საათი<input name="print_hours" type="number" min="0" max="16666" required value={printHours} onChange={(event) => setPrintHours(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">დამატებითი წუთი<input name="print_minutes" type="number" min="0" max="59" required value={printMinutes} onChange={(event) => setPrintMinutes(event.target.value)} className={inputClass} /></label>
        <label className="text-sm font-medium">მარჟა, %<input name="margin_percent" type="number" min="0" max="99.99" step="0.01" required value={marginPercent} onChange={(event) => setMarginPercent(event.target.value)} className={inputClass} /></label>
      </div>

      {price.data ? <div className="mt-5 flex flex-col justify-between gap-2 rounded-2xl bg-hooma-text p-5 text-white sm:flex-row sm:items-center"><div><p className="text-xs text-white/55">განახლებული გასაყიდი ფასი</p><p className="mt-1 text-3xl font-bold">₾{price.data.finalSalePrice.toFixed(2)}</p></div><div className="text-xs leading-5 text-white/60 sm:text-right"><p>თვითღირებულება ₾{price.data.productionCost.toFixed(2)}</p><p>{materialGrams} გ · {totalPrintMinutes} წუთი · მარჟა {price.data.marginPercent}%</p></div></div> : price.loading ? <p className="mt-5 text-sm text-hooma-muted">ფასი ითვლება...</p> : price.error ? <p className="mt-5 text-sm text-red-700">{price.error}</p> : null}

      <div className="mt-6 border-t border-hooma-text/10 pt-6">
        <div className="flex items-center gap-2"><Palette size={18} className="text-hooma-accent" /><h3 className="font-semibold">ფერის რეჟიმი</h3></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="flex cursor-pointer gap-3 rounded-2xl border border-hooma-text/10 bg-white p-4 has-[:checked]:border-hooma-accent has-[:checked]:bg-hooma-accent/10"><input type="radio" name="color_mode" value="customer_choice" checked={colorMode === "customer_choice"} onChange={() => setColorMode("customer_choice")} className="mt-1 accent-hooma-accent" /><div><p className="font-semibold">ერთფერიანი</p><p className="mt-1 text-xs text-hooma-muted">მომხმარებელი ირჩევს ერთ ფერს.</p></div></label>
          <label className="flex cursor-pointer gap-3 rounded-2xl border border-hooma-text/10 bg-white p-4 has-[:checked]:border-hooma-accent has-[:checked]:bg-hooma-accent/10"><input type="radio" name="color_mode" value="fixed_multicolor" checked={colorMode === "fixed_multicolor"} onChange={() => setColorMode("fixed_multicolor")} className="mt-1 accent-hooma-accent" /><Layers3 size={18} className="mt-0.5 text-hooma-accent" /><div><p className="font-semibold">მრავალფერიანი · AMS</p><p className="mt-1 text-xs text-hooma-muted">მომხმარებელი მიიღებს ფოტოზე ნაჩვენებ ფერთა კომბინაციას.</p></div></label>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{productColorOptions.map((color) => <label key={color.name} className="flex cursor-pointer items-center gap-3 rounded-xl border border-hooma-text/10 bg-white px-3 py-3 text-sm has-[:checked]:border-hooma-accent has-[:checked]:bg-hooma-accent/10"><input type="checkbox" name="colors" value={color.name} defaultChecked={initial.colors.includes(color.name)} className="h-4 w-4 accent-hooma-accent" /><span className="h-5 w-5 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} /><span>{color.name}</span></label>)}</div>
      </div>
      {state.message ? <p aria-live="polite" className={`mt-5 rounded-xl p-4 text-sm ${state.ok ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{state.message}</p> : null}
    </form>
  );
}
