"use client";

import { useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { BadgePercent, Calculator, LoaderCircle, LockKeyhole, Save } from "lucide-react";
import { saveDailyDealDiscountAction, saveMaterialCostAction, savePricingProfileAction } from "@/app/admin/settings/actions";
import { useCatalogPricePreview } from "@/components/admin/useCatalogPricePreview";

export type MaterialCostProfile = {
  id: string;
  code: string;
  name: string;
  cost_per_kg: number;
  waste_percent: number;
  is_active: boolean;
};

export type PricingProfile = {
  id: string;
  name: string;
  machine_hour_cost: number;
  labor_cost_per_order: number;
  packaging_cost: number;
  overhead_percent: number;
  failure_reserve_percent: number;
  default_margin_percent: number;
  daily_deal_discount_percent: number;
  vat_percent: number;
  rounding_step: number;
  is_default: boolean;
};

type MaterialDraft = { cost_per_kg: string; waste_percent: string };
type SaveMessage = { ok: boolean; text: string };
type PricingNumberKey =
  | "machine_hour_cost"
  | "labor_cost_per_order"
  | "packaging_cost"
  | "overhead_percent"
  | "failure_reserve_percent"
  | "default_margin_percent"
  | "vat_percent"
  | "rounding_step";

const pricingFields: Array<{
  name: PricingNumberKey;
  label: string;
  max?: number;
  min?: number;
}> = [
  { name: "machine_hour_cost", label: "პრინტერის 1 საათი, ₾" },
  { name: "labor_cost_per_order", label: "შრომა თითო შეკვეთაზე, ₾" },
  { name: "packaging_cost", label: "შეფუთვა, ₾" },
  { name: "overhead_percent", label: "ზედნადები ხარჯი, %", max: 100 },
  { name: "failure_reserve_percent", label: "წარუმატებელი ბეჭდვის რეზერვი, %", max: 100 },
  { name: "default_margin_percent", label: "საბაზო მოგების მარჟა, %", max: 99.99 },
  { name: "vat_percent", label: "დღგ, %", max: 100 },
  { name: "rounding_step", label: "ფასის დამრგვალება, ₾", min: 0.01 },
];

const money = new Intl.NumberFormat("ka-GE", {
  style: "currency",
  currency: "GEL",
  maximumFractionDigits: 2,
});
const decimal = new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 2 });
const inputClass =
  "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent";
const normalizeMaterial = (profile: MaterialCostProfile): MaterialCostProfile => ({
  ...profile,
  cost_per_kg: Number(profile.cost_per_kg),
  waste_percent: Number(profile.waste_percent),
});

const normalizePricing = (profile: PricingProfile): PricingProfile => ({
  ...profile,
  machine_hour_cost: Number(profile.machine_hour_cost),
  labor_cost_per_order: Number(profile.labor_cost_per_order),
  packaging_cost: Number(profile.packaging_cost),
  overhead_percent: Number(profile.overhead_percent),
  failure_reserve_percent: Number(profile.failure_reserve_percent),
  default_margin_percent: Number(profile.default_margin_percent),
  daily_deal_discount_percent: Number(profile.daily_deal_discount_percent ?? 50),
  vat_percent: Number(profile.vat_percent),
  rounding_step: Number(profile.rounding_step),
});

const materialDraft = (profile: MaterialCostProfile): MaterialDraft => ({
  cost_per_kg: String(profile.cost_per_kg),
  waste_percent: String(profile.waste_percent),
});

const pricingDraft = (profile: PricingProfile): Record<PricingNumberKey, string> => ({
  machine_hour_cost: String(profile.machine_hour_cost),
  labor_cost_per_order: String(profile.labor_cost_per_order),
  packaging_cost: String(profile.packaging_cost),
  overhead_percent: String(profile.overhead_percent),
  failure_reserve_percent: String(profile.failure_reserve_percent),
  default_margin_percent: String(profile.default_margin_percent),
  vat_percent: String(profile.vat_percent),
  rounding_step: String(profile.rounding_step),
});

function SaveButton({ compact = false }: { compact?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      title={compact ? "შენახვა" : undefined}
      className={
        compact
          ? "grid h-11 w-11 place-items-center rounded-xl bg-hooma-text text-white disabled:cursor-wait disabled:opacity-60"
          : "rounded-xl bg-hooma-text px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60 sm:col-span-2 xl:col-span-4"
      }
    >
      {pending ? <LoaderCircle size={17} className="animate-spin" /> : compact ? <Save size={17} /> : "პარამეტრების შენახვა"}
    </button>
  );
}

function DailyDealSaveButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
      {pending ? <LoaderCircle size={17} className="animate-spin" /> : <Save size={17} />}
      {pending ? "ინახება..." : "დღის შეთავაზების შენახვა"}
    </button>
  );
}

export function CostSettingsEditor({
  materials,
  pricing,
}: {
  materials: MaterialCostProfile[];
  pricing: PricingProfile | null;
}) {
  const initialMaterials = useMemo(() => materials.map(normalizeMaterial), [materials]);
  const initialPricing = useMemo(() => (pricing ? normalizePricing(pricing) : null), [pricing]);
  const [savedMaterials, setSavedMaterials] = useState(initialMaterials);
  const [savedPricing, setSavedPricing] = useState(initialPricing);
  const [materialDrafts, setMaterialDrafts] = useState<Record<string, MaterialDraft>>(() =>
    Object.fromEntries(initialMaterials.map((item) => [item.id, materialDraft(item)])),
  );
  const [pricingValues, setPricingValues] = useState<Record<PricingNumberKey, string> | null>(() =>
    initialPricing ? pricingDraft(initialPricing) : null,
  );
  const [materialMessages, setMaterialMessages] = useState<Record<string, SaveMessage>>({});
  const [pricingMessage, setPricingMessage] = useState<SaveMessage | null>(null);
  const [dailyDealDiscount, setDailyDealDiscount] = useState(initialPricing ? String(initialPricing.daily_deal_discount_percent) : "50");
  const [dailyDealMessage, setDailyDealMessage] = useState<SaveMessage | null>(null);
  const [materialId, setMaterialId] = useState(initialMaterials[0]?.id ?? "");
  const [grams, setGrams] = useState("");
  const [minutes, setMinutes] = useState("");
  const [margin, setMargin] = useState(initialPricing ? String(initialPricing.default_margin_percent) : "");

  const selectedMaterial = savedMaterials.find((item) => item.id === materialId);
  const pricePreview = useCatalogPricePreview({
    materialProfileId: selectedMaterial?.id ?? "",
    pricingProfileId: savedPricing?.id ?? "",
    materialGrams: grams,
    printMinutes: minutes,
    marginPercent: margin,
  });
  const result = pricePreview.data;

  const updateMaterialDraft = (id: string, key: keyof MaterialDraft, value: string) => {
    setMaterialDrafts((current) => ({
      ...current,
      [id]: { ...current[id], [key]: value },
    }));
    setMaterialMessages((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
  };

  const submitMaterial = async (id: string, formData: FormData) => {
    const response = await saveMaterialCostAction(formData);
    if (!response.ok) {
      setMaterialMessages((current) => ({ ...current, [id]: { ok: false, text: response.message } }));
      return;
    }

    const saved = normalizeMaterial(response.data as MaterialCostProfile);
    setSavedMaterials((current) => current.map((item) => (item.id === saved.id ? saved : item)));
    setMaterialDrafts((current) => ({ ...current, [saved.id]: materialDraft(saved) }));
    setMaterialMessages((current) => ({ ...current, [saved.id]: { ok: true, text: response.message } }));
  };

  const submitPricing = async (formData: FormData) => {
    const response = await savePricingProfileAction(formData);
    if (!response.ok) {
      setPricingMessage({ ok: false, text: response.message });
      return;
    }

    const saved = normalizePricing(response.data as PricingProfile);
    setSavedPricing(saved);
    setPricingValues(pricingDraft(saved));
    setMargin(String(saved.default_margin_percent));
    setPricingMessage({ ok: true, text: response.message });
  };

  const submitDailyDealDiscount = async (formData: FormData) => {
    const response = await saveDailyDealDiscountAction(formData);
    if (!response.ok) {
      setDailyDealMessage({ ok: false, text: response.message });
      return;
    }
    const saved = normalizePricing(response.data as PricingProfile);
    setSavedPricing(saved);
    setDailyDealDiscount(String(saved.daily_deal_discount_percent));
    setDailyDealMessage({ ok: true, text: response.message });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3 rounded-2xl border border-hooma-text/10 bg-hooma-text p-5 text-white">
        <LockKeyhole size={20} className="mt-0.5 shrink-0 text-hooma-secondary" />
        <div>
          <h2 className="font-semibold">Admin-only financial data</h2>
          <p className="mt-1 text-sm leading-6 text-white/60">
            მასალის ფასი, დანაკარგი, საათობრივი ღირებულება, თვითღირებულება და მარჟა საჯარო პროდუქტის API-ში არ იკითხება.
          </p>
        </div>
      </div>

      <section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft">
        <h2 className="text-xl font-semibold">მასალის თვითღირებულება</h2>
        <p className="mt-2 text-sm leading-6 text-hooma-muted">
          თითოეული მასალისთვის ფასი და დანაკარგი ცალ-ცალკე ინახება. შენახვისას ამ მასალით უკვე დამატებული პროდუქტების ფასებიც ავტომატურად გადაითვლება.
        </p>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {savedMaterials.map((item) => {
            const draft = materialDrafts[item.id] ?? materialDraft(item);
            const message = materialMessages[item.id];
            return (
              <form
                key={item.id}
                action={(formData) => submitMaterial(item.id, formData)}
                className="grid gap-3 rounded-2xl border border-hooma-text/10 bg-hooma-background p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
              >
                <input type="hidden" name="id" value={item.id} />
                <label className="text-sm font-medium">
                  {item.name} — ₾/კგ
                  <input
                    name="cost_per_kg"
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={draft.cost_per_kg}
                    onChange={(event) => updateMaterialDraft(item.id, "cost_per_kg", event.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="text-sm font-medium">
                  დანაკარგი %
                  <input
                    name="waste_percent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    required
                    value={draft.waste_percent}
                    onChange={(event) => updateMaterialDraft(item.id, "waste_percent", event.target.value)}
                    className={inputClass}
                  />
                </label>
                <SaveButton compact />
                {message ? (
                  <p
                    aria-live="polite"
                    className={`text-xs sm:col-span-3 ${message.ok ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {message.text}
                  </p>
                ) : null}
              </form>
            );
          })}
        </div>
      </section>

      {savedPricing && pricingValues ? (
        <section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft">
          <h2 className="text-xl font-semibold">წარმოებისა და ფასის პარამეტრები</h2>
          <p className="mt-2 text-sm leading-6 text-hooma-muted">
            ეს არის Hooma-ს ერთი საერთო ფასის პროფილი. შენახვისას ყველა არსებული პროდუქტის თვითღირებულება და გასაყიდი ფასი განახლდება; პროდუქტის ინდივიდუალური მარჟა უცვლელი დარჩება.
          </p>
          <p className="mt-1 text-xs leading-5 text-hooma-muted">უკვე მიღებულ შეკვეთებში დაფიქსირებული ფასი არ შეიცვლება.</p>
          <form action={submitPricing} className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <input type="hidden" name="id" value={savedPricing.id} />
            {pricingFields.map((field) => (
              <label key={field.name} className="text-sm font-medium">
                {field.label}
                <input
                  name={field.name}
                  type="number"
                  min={field.min ?? 0}
                  max={field.max}
                  step="0.01"
                  required
                  value={pricingValues[field.name]}
                  onChange={(event) => {
                    setPricingValues((current) =>
                      current ? { ...current, [field.name]: event.target.value } : current,
                    );
                    setPricingMessage(null);
                  }}
                  className={inputClass}
                />
              </label>
            ))}
            <SaveButton />
            {pricingMessage ? (
              <p
                aria-live="polite"
                className={`text-sm sm:col-span-2 xl:col-span-4 ${pricingMessage.ok ? "text-emerald-700" : "text-red-700"}`}
              >
                {pricingMessage.text}
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      {savedPricing ? (
        <section className="rounded-[1.5rem] border border-red-200 bg-red-50/80 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-red-700"><BadgePercent size={20} /><h2 className="text-xl font-semibold">დღის შეთავაზების ფასდაკლება</h2></div>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-hooma-muted">ეს პარამეტრი დამოუკიდებელია წარმოების თვითღირებულებისა და პროდუქტის საბაზო ფასისგან. ცვლილება შენახვისთანავე გავრცელდება დღევანდელ შეთავაზებებსა და მომავალ ყოველდღიურ როტაციებზე.</p>
          <form action={submitDailyDealDiscount} className="mt-5 flex max-w-xl flex-col gap-3 sm:flex-row sm:items-end">
            <input type="hidden" name="id" value={savedPricing.id} />
            <label className="min-w-0 flex-1 text-sm font-medium">ფასდაკლება, %
              <input name="daily_deal_discount_percent" type="number" min="1" max="99.99" step="0.01" required value={dailyDealDiscount} onChange={(event) => { setDailyDealDiscount(event.target.value); setDailyDealMessage(null); }} className={inputClass} />
            </label>
            <DailyDealSaveButton />
          </form>
          {dailyDealMessage ? <p aria-live="polite" className={`mt-3 text-sm ${dailyDealMessage.ok ? "text-emerald-700" : "text-red-700"}`}>{dailyDealMessage.text}</p> : null}
        </section>
      ) : null}

      <section className="rounded-[1.5rem] border border-hooma-accent/20 bg-[#dfe8da] p-6">
        <div className="flex items-center gap-2">
          <Calculator size={19} className="text-hooma-accent" />
          <h2 className="text-xl font-semibold">ფასის კალკულატორი</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-hooma-muted">
          აირჩიე მასალა და შეიყვანე მხოლოდ წონა და ბეჭდვის დრო — დანარჩენ ხარჯებს კალკულატორი შენახული პარამეტრებიდან ავტომატურად წამოიღებს.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">
            მასალა
            <select value={materialId} onChange={(event) => setMaterialId(event.target.value)} className={inputClass}>
              {savedMaterials.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            წონა, გრამი
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={grams}
              onChange={(event) => setGrams(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium">
            ბეჭდვის დრო, წუთი
            <input
              type="number"
              min="1"
              step="1"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className={inputClass}
            />
          </label>
          <label className="text-sm font-medium">
            მარჟა, %
            <input
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              value={margin}
              onChange={(event) => setMargin(event.target.value)}
              className={inputClass}
            />
          </label>
        </div>

        {selectedMaterial ? (
          <p className="mt-4 text-xs text-hooma-muted">
            გამოყენებული შენახული ტარიფი: {selectedMaterial.name} — {money.format(selectedMaterial.cost_per_kg)}/კგ, დანაკარგი {decimal.format(selectedMaterial.waste_percent)}%.
          </p>
        ) : null}

        {result ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["მასალა", result.materialCost],
              ["პრინტერის დრო", result.machineCost],
              ["შრომა", result.laborCost],
              ["შეფუთვა", result.packagingCost],
              ["ზედნადები", result.overheadCost],
              ["ბეჭდვის რეზერვი", result.failureReserveCost],
              ["სრული თვითღირებულება", result.productionCost],
              ["ფასი დღგ-მდე", result.salePriceBeforeVat],
              ["დღგ", result.vatAmount],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-xl bg-white/70 p-4">
                <p className="text-xs text-hooma-muted">{String(label)}</p>
                <p className="mt-2 font-semibold">{money.format(Number(value))}</p>
              </div>
            ))}
            <div className="rounded-xl bg-hooma-text p-4 text-white sm:col-span-2 lg:col-span-3">
              <p className="text-xs text-white/55">საბოლოო გასაყიდი ფასი</p>
              <p className="mt-2 text-3xl font-bold">{money.format(result.finalSalePrice)}</p>
            </div>
          </div>
        ) : pricePreview.loading ? (
          <p className="mt-5 flex items-center gap-2 text-sm text-hooma-muted"><LoaderCircle size={16} className="animate-spin" />ფასი სერვერზე ითვლება...</p>
        ) : pricePreview.error ? (
          <p className="mt-5 text-sm text-red-700">{pricePreview.error}</p>
        ) : (
          <p className="mt-5 text-sm text-hooma-muted">შეიყვანე წონა და ბეჭდვის დრო კალკულაციისთვის.</p>
        )}
        <p className="mt-4 text-xs leading-5 text-hooma-muted">
          მარჟა ითვლება გასაყიდი ფასიდან და არა თვითღირებულებაზე უბრალო დამატებით.
        </p>
      </section>
    </div>
  );
}
