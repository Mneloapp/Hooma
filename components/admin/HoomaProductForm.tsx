"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileImage, FileJson, Layers3, LoaderCircle, Palette, Upload, Video, X } from "lucide-react";
import { createHoomaProductAction, prepareProductMediaUploadAction } from "@/app/admin/products/new/actions";
import type { MaterialCostProfile, PricingProfile } from "@/components/admin/CostSettingsEditor";
import { parseHoomaClipperDraft, type HoomaClipperDraft } from "@/lib/catalog-clipper";
import { createClient } from "@/lib/supabase/client";
import { productColorOptions } from "@/data/product-colors";

type CategoryOption = { id: string; name: string };
type UploadedMedia = { path: string; originalName: string; size: number; mimeType: string; kind: "image" | "video" };

const inputClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 outline-none focus:border-hooma-accent";
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const videoExtensions = new Set(["mp4", "webm"]);
const imageLimit = 10 * 1024 * 1024;
const videoLimit = 50 * 1024 * 1024;

const extensionOf = (file: File) => file.name.split(".").pop()?.toLowerCase() ?? "";
const readableSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
const contentType = (file: File) => ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" }[extensionOf(file)] ?? file.type) || "application/octet-stream";
const normalizedMatch = (value: string) => value.toLocaleLowerCase("ka-GE").replace(/[^a-z0-9\u10a0-\u10ff]+/g, "");

const setFormValue = (form: HTMLFormElement, name: string, value: string | number | null | undefined) => {
  if (value === null || value === undefined || value === "") return;
  const field = form.elements.namedItem(name);
  if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field instanceof HTMLSelectElement) {
    field.value = String(value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
  }
};

export function HoomaProductForm({ categories, materials, pricing }: { categories: CategoryOption[]; materials: MaterialCostProfile[]; pricing: PricingProfile }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [images, setImages] = useState<File[]>([]);
  const [video, setVideo] = useState<File | null>(null);
  const [importedMedia, setImportedMedia] = useState<HoomaClipperDraft["product"]["media"] | null>(null);
  const [colorMode, setColorMode] = useState<"customer_choice" | "fixed_multicolor">("customer_choice");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [progress, setProgress] = useState("");

  const importClipperDraft = async (file: File | null) => {
    if (!file) return;
    if (file.size < 1 || file.size > 512 * 1024) {
      setMessage("Hooma JSON ფაილი ცარიელია ან 512KB-ს აღემატება.");
      if (importInput.current) importInput.current.value = "";
      return;
    }

    try {
      const parsed = parseHoomaClipperDraft(JSON.parse(await file.text()));
      const form = formRef.current;
      if (!form) throw new Error("პროდუქტის ფორმა ჯერ მზად არ არის.");
      const technical = parsed.product.technical;
      setFormValue(form, "name", parsed.product.name);
      setFormValue(form, "description", parsed.product.description);
      setFormValue(form, "operator_reference", parsed.product.operatorReference || parsed.source.url);
      setFormValue(form, "material_grams", technical.weightGrams);
      setFormValue(form, "print_hours", technical.printTimeMinutes === null ? null : Math.floor(technical.printTimeMinutes / 60));
      setFormValue(form, "print_minutes", technical.printTimeMinutes === null ? null : Math.round(technical.printTimeMinutes % 60));
      setFormValue(form, "dimension_x", technical.dimensionsMm?.x);
      setFormValue(form, "dimension_y", technical.dimensionsMm?.y);
      setFormValue(form, "dimension_z", technical.dimensionsMm?.z);
      setFormValue(form, "margin_percent", technical.marginPercent);

      const materialHint = normalizedMatch(technical.material ?? "");
      const material = materialHint
        ? materials.find((item) => {
            const code = normalizedMatch(item.code);
            const name = normalizedMatch(item.name);
            return materialHint === code || materialHint === name || materialHint.startsWith(code) || name.includes(materialHint);
          })
        : null;
      if (material) setFormValue(form, "material_profile_id", material.id);

      const categoryHint = normalizedMatch(parsed.product.categoryHint ?? "");
      const category = categoryHint
        ? categories.find((item) => {
            const name = normalizedMatch(item.name);
            return name === categoryHint || name.includes(categoryHint) || categoryHint.includes(name);
          })
        : null;
      if (category) setFormValue(form, "category_id", category.id);

      setColorMode(technical.colorMode);
      const importedColors = new Set(technical.colors.map(normalizedMatch));
      form.querySelectorAll<HTMLInputElement>('input[name="colors"]').forEach((checkbox) => {
        checkbox.checked = importedColors.has(normalizedMatch(checkbox.value));
      });
      setImportedMedia(parsed.product.media);

      const review = [];
      if (!category) review.push("კატეგორია");
      if (!material) review.push("მასალა");
      if (!technical.colors.length) review.push("ფერები");
      if (parsed.product.media.imageUrls.length) review.push("ჩამოტვირთული ფოტოები");
      const warningText = parsed.warnings.length ? ` კლიპერის შენიშვნა: ${parsed.warnings.join(" ")}` : "";
      setMessage(`JSON იმპორტირებულია. ხელით გადაამოწმე${review.length ? `: ${review.join(", ")}` : " ყველა ველი"}.${warningText}`);
    } catch (error) {
      setImportedMedia(null);
      setMessage(error instanceof Error ? error.message : "Hooma JSON ფაილი ვერ წავიკითხე.");
    } finally {
      if (importInput.current) importInput.current.value = "";
    }
  };

  const chooseImages = (selected: FileList | null) => {
    if (!selected) return;
    const files = Array.from(selected);
    if (files.length < 1 || files.length > 12) { setMessage("აირჩიე მინიმუმ 1 და მაქსიმუმ 12 ფოტო."); return; }
    const invalid = files.find((file) => !imageExtensions.has(extensionOf(file)) || file.size < 1 || file.size > imageLimit);
    if (invalid) { setMessage(`ფოტო “${invalid.name}” არასწორი ფორმატისაა ან 10MB-ს აღემატება.`); return; }
    setImages(files);
    setMessage("");
  };

  const chooseVideo = (selected: FileList | null) => {
    const file = selected?.[0] ?? null;
    if (!file) { setVideo(null); return; }
    if (!videoExtensions.has(extensionOf(file)) || file.size < 1 || file.size > videoLimit) {
      setMessage(`ვიდეო “${file.name}” უნდა იყოს MP4/WebM და მაქსიმუმ 50MB.`);
      if (videoInput.current) videoInput.current.value = "";
      return;
    }
    setVideo(file);
    setMessage("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!images.length) { setMessage("პროდუქტს მინიმუმ ერთი ფოტო სჭირდება."); return; }
    const selectedColorCount = new FormData(formElement).getAll("colors").length;
    if (selectedColorCount < (colorMode === "fixed_multicolor" ? 2 : 1)) {
      setMessage(colorMode === "fixed_multicolor" ? "AMS პროდუქტისთვის აირჩიე მინიმუმ ორი ფერი." : "აირჩიე მინიმუმ ერთი ფერი, რომელიც მომხმარებელს გამოუჩნდება.");
      return;
    }
    const supabase = createClient() as any;
    if (!supabase) { setMessage("Supabase ჯერ არ არის დაკავშირებული."); return; }

    setBusy(true);
    setMessage("");
    setProgress("მედიის უსაფრთხო ატვირთვა მზადდება...");
    const files = [...images.map((file) => ({ file, kind: "image" as const })), ...(video ? [{ file: video, kind: "video" as const }] : [])];
    const prepareData = new FormData();
    prepareData.set("files", JSON.stringify(files.map(({ file, kind }) => ({ name: file.name, size: file.size, mimeType: contentType(file), kind }))));
    const prepared = await prepareProductMediaUploadAction(prepareData);
    if (!prepared.ok || !prepared.requestId || !prepared.uploads?.length) {
      setBusy(false);
      setProgress("");
      setMessage(prepared.message);
      return;
    }

    const uploaded: UploadedMedia[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const { file, kind } = files[index];
      const upload = prepared.uploads[index];
      setProgress(`იტვირთება ${index + 1}/${files.length}: ${file.name}`);
      const mimeType = contentType(file);
      const { error } = await supabase.storage.from("product-media").uploadToSignedUrl(upload.path, upload.token, file, {
        cacheControl: "31536000",
        contentType: mimeType,
      });
      if (error) {
        if (uploaded.length) await supabase.storage.from("product-media").remove(uploaded.map((item) => item.path));
        setBusy(false);
        setProgress("");
        setMessage(`მედია ვერ აიტვირთა: ${error.message}`);
        return;
      }
      uploaded.push({ path: upload.path, originalName: file.name, size: file.size, mimeType, kind });
    }

    setProgress("Draft იქმნება და ფასი ითვლება...");
    const actionData = new FormData(formElement);
    actionData.set("media_request_id", prepared.requestId);
    actionData.set("media_manifest", JSON.stringify(uploaded));
    const result = await createHoomaProductAction(actionData);
    if (!result.ok) {
      await supabase.storage.from("product-media").remove(uploaded.map((item) => item.path));
      setBusy(false);
      setProgress("");
      setMessage(result.message);
      return;
    }

    setMessage(result.message);
    setProgress("Draft მზადაა");
    router.push(`/admin/products/${result.productId}`);
    router.refresh();
  };

  return (
    <form ref={formRef} onSubmit={submit} className="mt-6 space-y-7">
      <input type="hidden" name="pricing_profile_id" value={pricing.id} />

      <section className="rounded-2xl border border-hooma-accent/25 bg-hooma-accent/5 p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div><div className="flex items-center gap-2"><FileJson size={19} className="text-hooma-accent" /><h3 className="font-semibold">Catalog Clipper-იდან იმპორტი</h3></div><p className="mt-1 text-xs leading-5 text-hooma-muted">შემოიტანე გაფართოების მიერ მომზადებული .hooma.json. სისტემა შეავსებს ნაპოვნ ველებს; შენ გადაამოწმებ და Draft-ს შექმნი.</p></div>
          <label className="inline-flex min-h-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl bg-hooma-text px-4 py-2.5 text-sm font-semibold text-white"><Upload size={16} />JSON-ის არჩევა<input ref={importInput} type="file" accept=".json,.hooma.json,application/json" onChange={(event) => void importClipperDraft(event.target.files?.[0] ?? null)} className="sr-only" /></label>
        </div>
        {importedMedia ? <div className="mt-4 border-t border-hooma-text/10 pt-4"><p className="text-sm font-semibold">წყაროდან ნაპოვნი მედია</p><p className="mt-1 text-xs leading-5 text-hooma-muted">ბრაუზერის უსაფრთხოების გამო JSON ფაილი ფოტოს ფაილად ვერ აქცევს. Clipper-ით ჩამოტვირთული ფოტოები ქვემოთ „ფოტოების არჩევა“-ში ატვირთე.</p>{importedMedia.imageUrls.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-1">{importedMedia.imageUrls.map((url, index) => <a key={url} href={url} target="_blank" rel="noreferrer" title={`წყაროს ფოტო ${index + 1}`} className="block h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-hooma-text/10 bg-white"><img src={url} alt={`იმპორტირებული ფოტო ${index + 1}`} referrerPolicy="no-referrer" className="h-full w-full object-cover" /></a>)}</div> : <p className="mt-2 text-xs text-amber-800">JSON-ში ფოტო-ბმული არ არის — ფოტოები ხელით დაამატე.</p>}{importedMedia.videoUrl ? <a href={importedMedia.videoUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex text-xs font-semibold text-hooma-accent underline">წყაროს ვიდეოს გახსნა</a> : null}</div> : null}
      </section>

      <section>
        <div className="flex items-start justify-between gap-4"><div><h3 className="font-semibold">ძირითადი ინფორმაცია</h3><p className="mt-1 text-xs leading-5 text-hooma-muted">SKU ხელით არ იწერება — სისტემა ყველა ახალ პროდუქტს უნიკალურ HOO კოდს მიანიჭებს.</p></div><span className="shrink-0 rounded-full bg-hooma-panel px-3 py-1.5 text-xs font-semibold text-hooma-muted">SKU: ავტომატური</span></div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">სახელი<input name="name" required minLength={2} maxLength={160} placeholder="პროდუქტის სახელი" className={inputClass} /></label>
          <label className="text-sm font-medium">კატეგორია / ქვეკატეგორია<select name="category_id" required className={inputClass}><option value="">აირჩიე</option>{categories.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium sm:col-span-2">აღწერა<textarea name="description" required minLength={10} maxLength={3000} rows={5} placeholder="აღწერე პროდუქტი, დანიშნულება და მომხმარებლისთვის მნიშვნელოვანი დეტალები" className={inputClass} /></label>
          <label className="text-sm font-medium sm:col-span-2">ოპერატორის რეფერენსი <span className="font-normal text-hooma-muted">— მომხმარებელს არ უჩანს</span><textarea name="operator_reference" required minLength={3} maxLength={2000} rows={3} placeholder="ჩასვი მოდელის ბმული, ფაილის მდებარეობა ან ბეჭდვისთვის საჭირო შიდა ინსტრუქცია" className={inputClass} /><span className="mt-2 block text-xs font-normal leading-5 text-hooma-muted">ინახება ცალკე დაცულ ცხრილში და ხელმისაწვდომია მხოლოდ Owner/Admin/Production Operator-ისთვის.</span></label>
        </div>
      </section>

      <section className="rounded-2xl border border-hooma-text/10 bg-hooma-panel/45 p-5">
        <h3 className="font-semibold">ფოტო და ვიდეო</h3><p className="mt-1 text-xs leading-5 text-hooma-muted">პირველი ფოტო გახდება მთავარი. ვიდეო არასავალდებულოა.</p>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div><label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-hooma-text/20 bg-white p-5 text-center transition hover:border-hooma-accent/60"><Upload size={22} className="text-hooma-accent" /><span className="mt-3 text-sm font-semibold">ფოტოების არჩევა</span><span className="mt-1 text-xs text-hooma-muted">JPG, PNG ან WebP · 1–12 ფოტო · 10MB თითო</span><input ref={imageInput} type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" multiple onChange={(event) => chooseImages(event.target.files)} className="sr-only" /></label>
            {images.length ? <div className="mt-3 grid gap-2">{images.map((file, index) => <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm"><FileImage size={16} className="shrink-0 text-hooma-accent" /><span className="min-w-0 flex-1 truncate">{index === 0 ? "მთავარი · " : ""}{file.name}</span><span className="text-xs text-hooma-muted">{readableSize(file.size)}</span><button type="button" aria-label={`Remove ${file.name}`} onClick={() => setImages((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="grid h-7 w-7 place-items-center rounded-full hover:bg-hooma-panel"><X size={14} /></button></div>)}</div> : null}
          </div>
          <div><label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-hooma-text/20 bg-white p-5 text-center transition hover:border-hooma-accent/60"><Video size={22} className="text-hooma-accent" /><span className="mt-3 text-sm font-semibold">ვიდეოს დამატება (არასავალდებულო)</span><span className="mt-1 text-xs text-hooma-muted">MP4 ან WebM · მაქსიმუმ 50MB</span><input ref={videoInput} type="file" accept=".mp4,.webm,video/mp4,video/webm" onChange={(event) => chooseVideo(event.target.files)} className="sr-only" /></label>
            {video ? <div className="mt-3 flex items-center gap-3 rounded-xl bg-white px-3 py-2.5 text-sm"><Video size={16} className="shrink-0 text-hooma-accent" /><span className="min-w-0 flex-1 truncate">{video.name}</span><span className="text-xs text-hooma-muted">{readableSize(video.size)}</span><button type="button" aria-label={`Remove ${video.name}`} onClick={() => { setVideo(null); if (videoInput.current) videoInput.current.value = ""; }} className="grid h-7 w-7 place-items-center rounded-full hover:bg-hooma-panel"><X size={14} /></button></div> : null}
          </div>
        </div>
      </section>

      <section className="rounded-2xl bg-hooma-panel/70 p-5">
        <h3 className="font-semibold">ტექნიკური პროფილი და მარჟა</h3><p className="mt-1 text-xs leading-5 text-hooma-muted">მასალის თვითღირებულება და დროის ხარჯი Settings-იდან წამოვა; აქ შეყვანილი მარჟით საბოლოო ფასი ავტომატურად დაითვლება.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-medium">მასალის ტიპი<select name="material_profile_id" required className={inputClass}><option value="">აირჩიე</option>{materials.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label className="text-sm font-medium">წონა, გრამი<input name="material_grams" type="number" min="0.01" step="0.01" required className={inputClass} /></label>
          <label className="text-sm font-medium">ბეჭდვის დრო — საათი<input name="print_hours" type="number" min="0" max="16666" defaultValue="0" required className={inputClass} /></label>
          <label className="text-sm font-medium">ბეჭდვის დრო — წუთი<input name="print_minutes" type="number" min="0" max="59" defaultValue="0" required className={inputClass} /></label>
          <label className="text-sm font-medium">X ზომა, მმ<input name="dimension_x" type="number" min="0.01" step="0.01" required className={inputClass} /></label>
          <label className="text-sm font-medium">Y ზომა, მმ<input name="dimension_y" type="number" min="0.01" step="0.01" required className={inputClass} /></label>
          <label className="text-sm font-medium">Z ზომა, მმ<input name="dimension_z" type="number" min="0.01" step="0.01" required className={inputClass} /></label>
          <label className="text-sm font-medium">მოგების მარჟა, %<input name="margin_percent" type="number" min="0" max="99.99" step="0.01" defaultValue={pricing.default_margin_percent} required className={inputClass} /></label>
        </div>
        <div className="mt-6 border-t border-hooma-text/10 pt-5"><div className="flex items-center gap-2"><Palette size={18} className="text-hooma-accent" /><h4 className="text-sm font-semibold">ფერის რეჟიმი</h4></div><div className="mt-4 grid gap-3 md:grid-cols-2"><label className="flex cursor-pointer gap-3 rounded-2xl border border-hooma-text/10 bg-white p-4 transition has-[:checked]:border-hooma-accent has-[:checked]:bg-hooma-accent/10"><input type="radio" name="color_mode" value="customer_choice" checked={colorMode === "customer_choice"} onChange={() => setColorMode("customer_choice")} className="mt-1 h-4 w-4 accent-hooma-accent" /><div><p className="text-sm font-semibold">ერთფერიანი · მომხმარებელი ირჩევს</p><p className="mt-1 text-xs leading-5 text-hooma-muted">მონიშნული ფერები იქნება ცალკეული არჩევანი პროდუქტის გვერდზე.</p></div></label><label className="flex cursor-pointer gap-3 rounded-2xl border border-hooma-text/10 bg-white p-4 transition has-[:checked]:border-hooma-accent has-[:checked]:bg-hooma-accent/10"><input type="radio" name="color_mode" value="fixed_multicolor" checked={colorMode === "fixed_multicolor"} onChange={() => setColorMode("fixed_multicolor")} className="mt-1 h-4 w-4 accent-hooma-accent" /><Layers3 size={18} className="mt-0.5 shrink-0 text-hooma-accent" /><div><p className="text-sm font-semibold">მრავალფერიანი · AMS</p><p className="mt-1 text-xs leading-5 text-hooma-muted">მონიშნული ფერები ქმნის ერთ ფიქსირებულ კომბინაციას. მომხმარებელი მიიღებს ზუსტად ფოტოზე ნაჩვენებ ვერსიას.</p></div></label></div><p className="mt-5 text-sm font-semibold">{colorMode === "fixed_multicolor" ? "AMS-ში გამოსაყენებელი ფერები" : "მომხმარებლისთვის ხელმისაწვდომი ფერები"}</p><p className="mt-1 text-xs leading-5 text-hooma-muted">{colorMode === "fixed_multicolor" ? "აირჩიე მინიმუმ ორი ფერი. ეს სია სრულად გამოჩნდება მხოლოდ ოპერატორთან; მომხმარებელი დაინახავს „მრავალფერიანი — როგორც ფოტოზე“." : "მომხმარებელი მხოლოდ აქ მონიშნულ ფერებს დაინახავს და ერთ-ერთს აირჩევს."}</p><div className="mt-4 grid gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">{productColorOptions.map((color) => <label key={color.name} className="flex cursor-pointer items-center gap-3 rounded-xl border border-hooma-text/10 bg-white px-3 py-3 text-sm transition has-[:checked]:border-hooma-accent has-[:checked]:bg-hooma-accent/10"><input type="checkbox" name="colors" value={color.name} className="h-4 w-4 accent-hooma-accent" /><span className="h-5 w-5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: color.hex }} /><span>{color.name}</span></label>)}</div></div>
      </section>

      {message ? <p aria-live="polite" className="rounded-xl bg-hooma-panel p-4 text-sm leading-6">{message}</p> : null}
      <button type="submit" disabled={busy || !materials.length || !categories.length} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-hooma-text px-6 py-4 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45">{busy ? <><LoaderCircle size={18} className="animate-spin" />{progress || "Draft იქმნება..."}</> : "Draft-ში შენახვა"}</button>
    </form>
  );
}
