"use client";

import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { CheckCircle2, ClipboardPaste, LockKeyhole } from "lucide-react";
import { createProductDraftFromImportAction } from "@/app/admin/imports/actions";
import type { MaterialCostProfile, PricingProfile } from "@/components/admin/CostSettingsEditor";

type CategoryOption = { id: string; name: string };
type ImporterPayload = {
  schema: "hooma-makerworld-import-v1";
  source_url: string;
  model_id: string | null;
  profile_id: string | null;
  profile_name: string | null;
  title: string;
  description: string;
  images: string[];
  material: string | null;
  material_grams: number | null;
  print_minutes: number | null;
  dimensions: { x: number; y: number; z: number; unit: "mm" } | null;
  missing: string[];
};
type ImporterMessage = { ok: boolean; text: string };
const inputClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent";

const missingLabels: Record<string, string> = {
  images: "ფოტოები",
  material: "მასალა",
  material_grams: "წონა",
  print_minutes: "ბეჭდვის დრო",
  dimensions: "ზომები",
};

function isImporterPayload(value: unknown): value is ImporterPayload {
  if (!value || typeof value !== "object") return false;
  const payload = value as Partial<ImporterPayload>;
  return payload.schema === "hooma-makerworld-import-v1"
    && typeof payload.source_url === "string"
    && Array.isArray(payload.images)
    && Array.isArray(payload.missing);
}

function modelIdFromUrl(value: string) {
  try { return new URL(value).pathname.match(/\/models\/(\d+)/i)?.[1] ?? null; } catch { return null; }
}

export function ImportReviewForm({ importId, sourceUrl, sourceModelId, defaultName, defaultSlug, defaultDescription, defaultImages, categories, materials, pricing }: { importId: string; sourceUrl: string; sourceModelId: string | null; defaultName: string; defaultSlug: string; defaultDescription: string; defaultImages: string[]; categories: CategoryOption[]; materials: MaterialCostProfile[]; pricing: PricingProfile }) {
  const [state, action, pending] = useActionState(createProductDraftFromImportAction, {});
  const formRef = useRef<HTMLFormElement>(null);
  const [importerMessage, setImporterMessage] = useState<ImporterMessage | null>(null);

  const fillField = (name: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === "") return false;
    const field = formRef.current?.elements.namedItem(name);
    if (!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement)) return false;
    field.value = String(value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  };

  const fillFromImporter = async () => {
    try {
      const raw = await navigator.clipboard.readText();
      const parsed: unknown = JSON.parse(raw);
      if (!isImporterPayload(parsed)) throw new Error("Clipboard-ში Hooma Importer-ის სწორი მონაცემები ვერ მოიძებნა.");
      const expectedModelId = sourceModelId ?? modelIdFromUrl(sourceUrl);
      const receivedModelId = parsed.model_id ?? modelIdFromUrl(parsed.source_url);
      if (!expectedModelId || !receivedModelId || expectedModelId !== receivedModelId) {
        throw new Error("Importer-ის მონაცემები სხვა MakerWorld მოდელს ეკუთვნის.");
      }

      let filled = 0;
      if (fillField("name_en", parsed.title)) filled += 1;
      if (fillField("name_ka", parsed.title)) filled += 1;
      if (fillField("description", parsed.description)) filled += 1;
      if (parsed.images.length && fillField("image_urls", parsed.images.slice(0, 12).join("\n"))) filled += 1;
      if (fillField("material_grams", parsed.material_grams)) filled += 1;
      if (fillField("print_minutes", parsed.print_minutes)) filled += 1;
      if (fillField("dimension_x", parsed.dimensions?.x)) filled += 1;
      if (fillField("dimension_y", parsed.dimensions?.y)) filled += 1;
      if (fillField("dimension_z", parsed.dimensions?.z)) filled += 1;
      if (fillField("source_profile_id", parsed.profile_id)) filled += 1;
      if (fillField("source_profile_name", parsed.profile_name)) filled += 1;

      if (parsed.material) {
        const materialSelect = formRef.current?.elements.namedItem("material_profile_id");
        if (materialSelect instanceof HTMLSelectElement) {
          const normalized = parsed.material.toUpperCase().replace(/PLUS/g, "+").replace(/[^A-Z0-9]/g, "");
          const option = Array.from(materialSelect.options).find((item) => {
            const label = item.textContent?.toUpperCase().replace(/PLUS/g, "+").replace(/[^A-Z0-9]/g, "") ?? "";
            return label === normalized || label.startsWith(normalized) || normalized.startsWith(label);
          });
          if (option) {
            materialSelect.value = option.value;
            materialSelect.dispatchEvent(new Event("change", { bubbles: true }));
            filled += 1;
          }
        }
      }

      const missing = parsed.missing.map((item) => missingLabels[item] ?? item);
      setImporterMessage({
        ok: true,
        text: missing.length
          ? `${filled} ველი შეივსო. ხელით გადაამოწმე/შეავსე: ${missing.join(", ")}.`
          : `${filled} ველი ავტომატურად შეივსო. შექმნამდე ყველა მონაცემი გადაამოწმე.`,
      });
    } catch (error) {
      setImporterMessage({ ok: false, text: error instanceof Error ? error.message : "Importer-ის მონაცემები ვერ ჩაიტვირთა." });
    }
  };

  return <form ref={formRef} action={action} className="space-y-6"><input type="hidden" name="import_id" value={importId} /><input type="hidden" name="pricing_profile_id" value={pricing.id} /><input type="hidden" name="source_profile_id" /><input type="hidden" name="source_profile_name" />
    <section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><h2 className="text-xl font-semibold">1. Hooma პროდუქტის ინფორმაცია</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">MakerWorld Importer ავტომატურად შეავსებს არჩეული Print Profile-ის ძირითად და ტექნიკურ მონაცემებს.</p></div><button type="button" onClick={fillFromImporter} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-hooma-accent px-4 py-3 text-sm font-semibold text-white"><ClipboardPaste size={17} />იმპორტერიდან შევსება</button></div>{importerMessage ? <p aria-live="polite" className={`mt-4 rounded-xl p-4 text-sm ${importerMessage.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{importerMessage.text}</p> : null}<div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">ქართული სახელი<input name="name_ka" required defaultValue={defaultName} className={inputClass} /></label><label className="text-sm font-medium">ინგლისური სახელი<input name="name_en" required defaultValue={defaultName} className={inputClass} /></label><label className="text-sm font-medium">Slug<input name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*" defaultValue={defaultSlug} className={inputClass} /></label><label className="text-sm font-medium">კატეგორია / ქვეკატეგორია<select name="category_id" required className={inputClass}><option value="">აირჩიე</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium sm:col-span-2">აღწერა<textarea name="description" rows={5} maxLength={3000} defaultValue={defaultDescription} className={inputClass} /></label><label className="text-sm font-medium sm:col-span-2">MakerWorld ფოტო-ბმულები<textarea name="image_urls" rows={4} defaultValue={defaultImages.join("\n")} placeholder="თითო ხაზზე ერთი https://makerworld.bblmw.com/... ბმული" className={inputClass} /><span className="mt-2 block text-xs font-normal leading-5 text-hooma-muted">Importer შეეცდება მაქსიმუმ 12 ფოტოს ავტომატურად ჩასმას. გამოქვეყნებამდე ფოტოების გამოყენების უფლება მაინც უნდა დაადასტურო.</span></label></div></section>

    <section className="rounded-[1.5rem] bg-white/75 p-6 shadow-soft"><h2 className="text-xl font-semibold">2. ტექნიკური პროფილი და ფასი</h2><p className="mt-2 text-sm text-hooma-muted">ეს მონაცემები უნდა დაემთხვეს Bambu Studio/3MF პროფილს. მათზე დაყრდნობით ითვლება გასაყიდი ფასი.</p><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-medium">მასალა<select name="material_profile_id" required className={inputClass}>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-sm font-medium">წონა, გრამი<input name="material_grams" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">ბეჭდვის დრო, წუთი<input name="print_minutes" type="number" min="1" required className={inputClass} /></label><label className="text-sm font-medium">ფირფიტების რაოდენობა<input name="plate_count" type="number" min="1" max="100" defaultValue="1" required className={inputClass} /></label><label className="text-sm font-medium">X ზომა, მმ<input name="dimension_x" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">Y ზომა, მმ<input name="dimension_y" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">Z ზომა, მმ<input name="dimension_z" type="number" min="0.01" step="0.01" required className={inputClass} /></label><label className="text-sm font-medium">მოგების მარჟა, %<input name="margin_percent" type="number" min="0" max="99.99" step="0.01" defaultValue={pricing.default_margin_percent} required className={inputClass} /></label></div></section>

    <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-6"><div className="flex items-center gap-2"><LockKeyhole size={18} /><h2 className="text-xl font-semibold">3. ლიცენზია და ფოტოების უფლება</h2></div><p className="mt-2 text-sm leading-6 text-amber-900/75">Checkbox მონიშნე მხოლოდ მაშინ, როდესაც წყაროს ლიცენზია ან ავტორის წერილობითი ნებართვა ნამდვილად შეამოწმე. დაუდასტურებელი Draft ვერ გამოქვეყნდება.</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><label className="text-sm font-medium">ლიცენზიის სახელი<input name="license_name" placeholder="მაგ. CC BY 4.0 / Creator permission" className={inputClass} /></label><label className="text-sm font-medium">ლიცენზიის ან მტკიცებულების URL<input name="license_url" type="url" className={inputClass} /></label><label className="flex items-start gap-3 rounded-xl bg-white/70 p-4 text-sm"><input name="commercial_use_allowed" type="checkbox" className="mt-1" /><span><strong className="block">კომერციული გამოყენება ნებადართულია</strong><span className="mt-1 block text-xs text-hooma-muted">დაბეჭდილი პროდუქტის გაყიდვის უფლება დადასტურებულია.</span></span></label><label className="flex items-start gap-3 rounded-xl bg-white/70 p-4 text-sm"><input name="media_use_allowed" type="checkbox" className="mt-1" /><span><strong className="block">ფოტოების გამოყენება ნებადართულია</strong><span className="mt-1 block text-xs text-hooma-muted">წყაროს სურათების Hooma-ზე ჩვენების უფლება დადასტურებულია.</span></span></label></div></section>

    {state.message ? <div className={`rounded-xl p-4 text-sm ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-800"}`}>{state.ok ? <CheckCircle2 size={16} className="mr-2 inline" /> : null}{state.message}{state.productId ? <Link href={`/admin/products/${state.productId}`} className="ml-2 font-semibold underline">პროდუქტის გახსნა</Link> : null}</div> : null}
    <button disabled={pending || !materials.length || !categories.length} className="w-full rounded-xl bg-hooma-text px-6 py-4 font-semibold text-white disabled:opacity-45">{pending ? "Draft იქმნება..." : "პროდუქტის Draft-ის შექმნა"}</button>
  </form>;
}
