"use client";

import { useRef, useState } from "react";
import { FileBox, LoaderCircle, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { prepareCustomQuoteUploadAction, submitCustomQuoteRequestAction } from "@/app/account/custom-orders/actions";
import { useLanguage } from "@/components/LanguageProvider";

const allowedExtensions = new Set(["3mf", "stl", "step", "stp", "obj", "zip", "pdf", "png", "jpg", "jpeg", "webp"]);
const maxFileSize = 100 * 1024 * 1024;
const maxTotalSize = 250 * 1024 * 1024;

const fileSize = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;

export function CustomQuoteRequestForm() {
  const { language } = useLanguage();
  const georgian = language === "ka";
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);

  const chooseFiles = (selected: FileList | null) => {
    if (!selected) return;
    const next = Array.from(selected).slice(0, 5);
    const invalid = next.find((file) => !allowedExtensions.has(file.name.split(".").pop()?.toLowerCase() ?? "") || file.size > maxFileSize);
    if (invalid) {
      setMessage(georgian ? `ფაილი “${invalid.name}” არასწორი ფორმატისაა ან 100MB-ს აღემატება.` : `“${invalid.name}” has an invalid format or is larger than 100 MB.`);
      return;
    }
    if (next.reduce((sum, file) => sum + file.size, 0) > maxTotalSize) {
      setMessage(georgian ? "ფაილების ჯამური ზომა 250MB-ს არ უნდა აღემატებოდეს." : "The total file size cannot exceed 250 MB.");
      return;
    }
    setMessage("");
    setFiles(next);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!files.length) { setMessage(georgian ? "ატვირთე მინიმუმ ერთი ფაილი." : "Upload at least one file."); return; }
    const supabase = createClient() as any;
    if (!supabase) { setMessage(georgian ? "Supabase ჯერ არ არის დაკავშირებული." : "Supabase is not connected yet."); return; }

    setBusy(true);
    setMessage("");
    const form = new FormData(formElement);
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) { setBusy(false); setMessage(georgian ? "ფაილის გასაგზავნად ჯერ ანგარიშში შედი." : "Sign in before sending a file."); return; }

    setProgress(georgian ? "დაცული ატვირთვა მზადდება..." : "Preparing secure upload...");
    const prepareData = new FormData();
    prepareData.set("files", JSON.stringify(files.map((file) => ({ name: file.name, size: file.size }))));
    const prepared = await prepareCustomQuoteUploadAction(prepareData);
    if (!prepared.ok || !prepared.requestId || !prepared.uploads?.length) {
      setBusy(false);
      setProgress("");
      setMessage(georgian ? prepared.message : "The secure upload could not be prepared. Please try again.");
      return;
    }

    const requestId = prepared.requestId;
    const uploaded: Array<{ path: string; originalName: string; mimeType: string; size: number }> = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      setProgress(georgian ? `იტვირთება ${index + 1}/${files.length}: ${file.name}` : `Uploading ${index + 1}/${files.length}: ${file.name}`);
      const upload = prepared.uploads[index];
      const path = upload.path;
      const { error } = await supabase.storage.from("custom-quote-files").uploadToSignedUrl(path, upload.token, file, {
        cacheControl: "3600",
        contentType: file.type || "application/octet-stream",
      });
      if (error) {
        if (uploaded.length) await supabase.storage.from("custom-quote-files").remove(uploaded.map((item) => item.path));
        setBusy(false);
        setProgress("");
        setMessage(georgian ? `ატვირთვა ვერ დასრულდა: ${error.message}` : `Upload failed: ${error.message}`);
        return;
      }
      uploaded.push({ path, originalName: file.name, mimeType: file.type, size: file.size });
    }

    setProgress(georgian ? "მოთხოვნა იგზავნება შეფასებისთვის..." : "Sending request for review...");
    const actionData = new FormData();
    actionData.set("payload", JSON.stringify({
      requestId,
      title: form.get("title"),
      description: form.get("description"),
      quantity: Number(form.get("quantity")),
      dimensions: form.get("dimensions"),
      materialPreference: form.get("material_preference"),
      colorPreference: form.get("color_preference"),
      files: uploaded,
    }));
    const result = await submitCustomQuoteRequestAction(actionData);

    if (!result.ok) await supabase.storage.from("custom-quote-files").remove(uploaded.map((item) => item.path));
    if (result.ok) {
      formElement.reset();
      setFiles([]);
      if (fileInput.current) fileInput.current.value = "";
    }
    setMessage(georgian ? result.message : result.ok ? "Request received. Your custom quote will appear here after operator review." : "The request could not be submitted. Check the files and try again.");
    setProgress("");
    setBusy(false);
  };

  return (
    <form onSubmit={submit} className="space-y-5 rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm sm:p-6">
      <div><p className="text-xs font-semibold uppercase tracking-[0.2em] text-hooma-accent">{georgian ? "ახალი მოთხოვნა" : "New request"}</p><h2 className="mt-2 text-2xl font-semibold">{georgian ? "მიიღე ინდივიდუალური ფასი" : "Get a custom quote"}</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">{georgian ? "ატვირთე მოდელი, ნახაზი ან ფოტო. ოპერატორი შეამოწმებს დამზადების შესაძლებლობას, მასალას, დროსა და ფასს." : "Upload a model, drawing, or photo. An operator will review feasibility, material, timing, and price."}</p></div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium sm:col-span-2">{georgian ? "რას ამზადებ?" : "What are we making?"}<input name="title" required minLength={3} maxLength={120} placeholder={georgian ? "მაგ. კედლის სამაგრი კონკრეტული ზომით" : "e.g. a wall bracket in a specific size"} className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="text-sm font-medium">{georgian ? "რაოდენობა" : "Quantity"}<input name="quantity" type="number" min="1" max="100" defaultValue="1" required className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="text-sm font-medium">{georgian ? "ზომები" : "Dimensions"}<input name="dimensions" maxLength={500} placeholder={georgian ? "მაგ. 120 × 60 × 25 მმ" : "e.g. 120 × 60 × 25 mm"} className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="text-sm font-medium">{georgian ? "სასურველი მასალა" : "Preferred material"}<input name="material_preference" maxLength={120} placeholder={georgian ? "თუ არ იცი, ცარიელი დატოვე" : "Leave blank if unsure"} className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="text-sm font-medium">{georgian ? "სასურველი ფერი" : "Preferred color"}<input name="color_preference" maxLength={120} placeholder={georgian ? "მაგ. შავი" : "e.g. black"} className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" /></label>
        <label className="text-sm font-medium sm:col-span-2">{georgian ? "დეტალური აღწერა" : "Detailed description"}<textarea name="description" required minLength={10} maxLength={3000} rows={5} placeholder={georgian ? "აღწერე გამოყენება, დატვირთვა, თავსებადობა და სხვა მნიშვნელოვანი მოთხოვნები" : "Describe the use, load, compatibility, and other important requirements"} className="mt-2 w-full rounded-[1.25rem] border border-hooma-text/10 bg-white px-4 py-3 outline-none focus:border-hooma-accent" /></label>
      </div>

      <div>
        <p className="text-sm font-medium">{georgian ? "ფაილები" : "Files"}</p>
        <label className="mt-2 flex cursor-pointer flex-col items-center rounded-[1.25rem] border border-dashed border-hooma-text/20 bg-hooma-background px-5 py-8 text-center transition hover:border-hooma-accent/60">
          <Upload size={24} className="text-hooma-accent" /><span className="mt-3 text-sm font-semibold">{georgian ? "აირჩიე მაქსიმუმ 5 ფაილი" : "Choose up to 5 files"}</span><span className="mt-1 text-xs leading-5 text-hooma-muted">{georgian ? "3MF, STL, STEP, STP, OBJ, ZIP, PDF ან ფოტო · 100MB თითო ფაილი" : "3MF, STL, STEP, STP, OBJ, ZIP, PDF, or an image · 100 MB per file"}</span>
          <input ref={fileInput} type="file" multiple required accept=".3mf,.stl,.step,.stp,.obj,.zip,.pdf,.png,.jpg,.jpeg,.webp" onChange={(event) => chooseFiles(event.target.files)} className="sr-only" />
        </label>
        {files.length ? <div className="mt-3 grid gap-2">{files.map((file, index) => <div key={`${file.name}-${file.lastModified}`} className="flex items-center gap-3 rounded-xl bg-hooma-panel/70 px-3 py-2.5 text-sm"><FileBox size={16} className="shrink-0 text-hooma-accent" /><span className="min-w-0 flex-1 truncate">{file.name}</span><span className="shrink-0 text-xs text-hooma-muted">{fileSize(file.size)}</span><button type="button" onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))} aria-label={`Remove ${file.name}`} className="grid h-7 w-7 place-items-center rounded-full hover:bg-white"><X size={14} /></button></div>)}</div> : null}
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs leading-5 text-amber-900">{georgian ? "ფაილები ინახება private storage-ში და ავტომატურად არ გაეშვება ბეჭდვაზე. ოპერატორი ჯერ ამოწმებს ფაილს, უსაფრთხოებასა და წარმოების პარამეტრებს." : "Files are stored privately and are never sent to print automatically. An operator first checks the file, safety, and production settings."}</div>
      {message ? <p className="rounded-xl bg-hooma-panel p-4 text-sm leading-6">{message}</p> : null}
      <button type="submit" disabled={busy} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white transition hover:bg-hooma-accent disabled:cursor-not-allowed disabled:opacity-50">{busy ? <><LoaderCircle size={17} className="animate-spin" />{progress || (georgian ? "იგზავნება..." : "Sending...")}</> : (georgian ? "ფასის მოთხოვნის გაგზავნა" : "Send quote request")}</button>
    </form>
  );
}
