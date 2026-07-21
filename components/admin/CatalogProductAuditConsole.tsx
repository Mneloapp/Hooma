"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { Bot, Check, CheckCircle2, Clock3, ExternalLink, ImageOff, OctagonX, Palette, Play, Ruler, Sparkles, Trash2, TriangleAlert, X } from "lucide-react";
import {
  applyCatalogProductAuditItemAction,
  applyHighConfidenceCatalogAuditsAction,
  cancelCatalogProductAuditJobAction,
  createCatalogProductAuditJobAction,
  deleteCatalogProductFromAuditAction,
  rejectCatalogProductAuditItemAction,
} from "@/app/admin/catalog-agent/audit-actions";
import { productColorHex, productColorOptions } from "@/data/product-colors";

type Agent = { id: string; name: string; is_active: boolean };
type AuditJob = {
  id: string;
  agent_id: string;
  status: string;
  product_statuses: string[];
  total_count: number;
  processed_count: number;
  ready_count: number;
  applied_count: number;
  rejected_count: number;
  skipped_count: number;
  failed_count: number;
  worker_name: string | null;
  error_message: string | null;
  created_at: string;
};
type AuditItem = {
  id: string;
  job_id: string;
  product_id: string;
  status: string;
  current_snapshot: Record<string, any>;
  suggestion: Record<string, any>;
  confidence: number | null;
  warnings: string[];
  model_name: string | null;
  error_message: string | null;
  processed_at: string | null;
  product_slug?: string | null;
  available_colors?: string[];
  color_mode?: "customer_choice" | "fixed_multicolor";
};

const inputClass = "mt-2 w-full rounded-2xl border border-hooma-text/10 bg-white px-4 py-3 outline-none transition focus:border-hooma-accent";
const number = new Intl.NumberFormat("ka-GE");
const auditStatusLabel: Record<string, string> = {
  queued: "რიგშია",
  running: "მუშაობს",
  completed: "დასრულდა",
  failed: "შეცდომა",
  cancelled: "გაუქმდა",
  ready: "დასამტკიცებელია",
  applied: "დამტკიცებულია",
  rejected: "უარყოფილია",
  skipped: "გამოტოვებულია",
  processing: "მუშავდება",
};

const asImages = (value: unknown) => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && item.startsWith("https://"))
  : [];

function dimensionText(value: any) {
  if (!value || typeof value !== "object") return "Standard";
  return `${value.x} × ${value.y} × ${value.z} ${value.unit || "მმ"}`;
}

function DeleteProductFromAuditButton({ itemId, productName }: { itemId: string; productName: string }) {
  const [state, action, pending] = useActionState(deleteCatalogProductFromAuditAction, {});
  return (
    <div>
      <form
        action={action}
        onSubmit={(event) => {
          if (!window.confirm(`ნამდვილად წაიშალოს „${productName}“ მთლიანად პროდუქტების ბაზიდან?`)) {
            event.preventDefault();
            return;
          }
          if (!window.confirm("ეს მოქმედება შეუქცევადია. შეკვეთასთან დაკავშირებული დაცული პროდუქტი არ წაიშლება. საბოლოოდ ვადასტურებთ?")) {
            event.preventDefault();
          }
        }}
      >
        <input type="hidden" name="item_id" value={itemId} />
        <input type="hidden" name="confirmation" value="DELETE_PRODUCT" />
        <button disabled={pending} className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-800 disabled:opacity-50">
          <Trash2 size={15} />{pending ? "იშლება..." : "პროდუქტის მთლიანად წაშლა"}
        </button>
      </form>
      {state.message && !state.ok ? <p className="mt-2 max-w-xl text-xs leading-5 text-red-800">{state.message}</p> : null}
    </div>
  );
}

function AuditItemCard({ item }: { item: AuditItem }) {
  const before = item.current_snapshot ?? {};
  const suggestion = item.suggestion ?? {};
  const images = asImages(before.gallery_images);
  const suggestedKeptImages = asImages(suggestion.kept_image_urls);
  const suggestedKeptKey = suggestedKeptImages.join("\n");
  const proposedNameKa = String(suggestion.name_ka || before.name_ka || "");
  const proposedNameEn = String(suggestion.name_en || before.name_en || "");
  const proposedDescriptionKa = String(suggestion.description_ka || before.description_ka || "");
  const proposedDescriptionEn = String(suggestion.description_en || before.description_en || "");
  const initialColors = Array.isArray(item.available_colors) ? item.available_colors : [];
  const initialColorsKey = initialColors.join("\n");
  const initialColorMode = item.color_mode === "fixed_multicolor" ? "fixed_multicolor" : "customer_choice";
  const [keptImages, setKeptImages] = useState<string[]>(suggestedKeptImages);
  const [nameKa, setNameKa] = useState(proposedNameKa);
  const [nameEn, setNameEn] = useState(proposedNameEn);
  const [descriptionKa, setDescriptionKa] = useState(proposedDescriptionKa);
  const [descriptionEn, setDescriptionEn] = useState(proposedDescriptionEn);
  const [colorMode, setColorMode] = useState<"customer_choice" | "fixed_multicolor">(initialColorMode);
  const [colors, setColors] = useState<string[]>(initialColors.length ? initialColors : [productColorOptions[0].name]);
  const [approvalState, approvalAction, approvalPending] = useActionState(applyCatalogProductAuditItemAction, {});
  const [photoMessage, setPhotoMessage] = useState("");
  useEffect(() => setKeptImages(suggestedKeptImages), [item.id, suggestedKeptKey]);
  useEffect(() => {
    setNameKa(proposedNameKa);
    setNameEn(proposedNameEn);
    setDescriptionKa(proposedDescriptionKa);
    setDescriptionEn(proposedDescriptionEn);
    setColorMode(initialColorMode);
    setColors(initialColors.length ? initialColors : [productColorOptions[0].name]);
  }, [item.id, proposedNameKa, proposedNameEn, proposedDescriptionKa, proposedDescriptionEn, initialColorMode, initialColorsKey]);
  const kept = new Set(keptImages);
  const removedCount = images.filter((url) => !kept.has(url)).length;
  const ready = item.status === "ready";
  const confidence = item.confidence === null ? null : Math.round(Number(item.confidence) * 100);
  const currentName = String(before.name_ka || before.name_en || "პროდუქტი");
  const approvalFormId = `catalog-audit-approval-${item.id}`;
  const computedHero = kept.has(String(suggestion.hero_image_url))
    ? String(suggestion.hero_image_url)
    : keptImages[0];

  const toggleColor = (color: string) => {
    setColors((current) => current.includes(color) ? current.filter((item) => item !== color) : [...current, color]);
  };

  const toggleImage = (url: string) => {
    setKeptImages((current) => {
      if (current.includes(url) && current.length === 1) {
        setPhotoMessage("მინიმუმ ერთი ფოტო უნდა დარჩეს.");
        return current;
      }
      setPhotoMessage("");
      return current.includes(url)
        ? current.filter((imageUrl) => imageUrl !== url)
        : images.filter((imageUrl) => current.includes(imageUrl) || imageUrl === url);
    });
  };

  return (
    <article className="rounded-2xl border border-hooma-text/10 bg-white p-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{currentName}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${item.status === "ready" ? "bg-amber-100 text-amber-900" : item.status === "applied" ? "bg-emerald-100 text-emerald-800" : item.status === "failed" ? "bg-red-100 text-red-800" : "bg-hooma-panel text-hooma-muted"}`}>{auditStatusLabel[item.status] ?? item.status}</span>{confidence !== null ? <span className="rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-semibold text-sky-800">სანდოობა {confidence}%</span> : null}</div>
          <p className="mt-1 text-xs text-hooma-muted">{item.model_name || "—"}</p>
        </div>
        <div className="flex flex-wrap gap-3"><Link href={`/admin/products/${item.product_id}`} className="text-xs font-semibold underline underline-offset-4">ადმინში გახსნა</Link>{item.product_slug ? <Link href={`/product/${item.product_slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-hooma-accent underline underline-offset-4">საჯარო გვერდის შემოწმება<ExternalLink size={13} /></Link> : null}</div>
      </div>

      {ready || item.status === "applied" ? <>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-hooma-panel p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-hooma-muted">ძველი სახელი</p><p className="mt-2 text-sm font-semibold leading-6">{before.name_ka || "—"}</p><p className="mt-1 text-xs text-hooma-muted">{before.name_en || "—"}</p></div>
          <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">შესწორებული სახელი · შეგიძლია შეცვალო</p><div className="mt-3 grid gap-3"><label className="text-xs font-semibold text-emerald-950">ქართული სახელი<input form={approvalFormId} name="name_ka" lang="ka" required minLength={2} maxLength={160} disabled={approvalPending} value={nameKa} onChange={(event) => setNameKa(event.target.value)} className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-emerald-600 disabled:opacity-60" /></label><label className="text-xs font-semibold text-emerald-950">ინგლისური სახელი<input form={approvalFormId} name="name_en" lang="en" required minLength={2} maxLength={160} disabled={approvalPending} value={nameEn} onChange={(event) => setNameEn(event.target.value)} className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:border-emerald-600 disabled:opacity-60" /></label></div></div>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl bg-hooma-panel p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-hooma-muted">ძველი აღწერა</p><p className="mt-2 text-sm leading-6">{before.description_ka || "—"}</p><p className="mt-3 border-t border-hooma-text/10 pt-3 text-xs leading-5 text-hooma-muted">{before.description_en || "—"}</p></div>
          <div className="rounded-xl bg-emerald-50 p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-emerald-800">შემოკლებული აღწერა · შეგიძლია შეცვალო</p><div className="mt-3 grid gap-3"><label className="text-xs font-semibold text-emerald-950">ქართული აღწერა<textarea form={approvalFormId} name="description_ka" lang="ka" required minLength={10} maxLength={800} rows={4} disabled={approvalPending} value={descriptionKa} onChange={(event) => setDescriptionKa(event.target.value)} className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-emerald-600 disabled:opacity-60" /></label><label className="text-xs font-semibold text-emerald-950">ინგლისური აღწერა<textarea form={approvalFormId} name="description_en" lang="en" required minLength={10} maxLength={800} rows={4} disabled={approvalPending} value={descriptionEn} onChange={(event) => setDescriptionEn(event.target.value)} className="mt-1.5 w-full rounded-xl border border-emerald-200 bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-emerald-600 disabled:opacity-60" /></label></div></div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-hooma-text/10 p-4"><p className="text-xs text-hooma-muted">ძველი ზომა</p><p className="mt-2 text-sm font-semibold">{before.size_label || dimensionText(before.product_dimensions)}</p></div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4"><p className="text-xs text-emerald-800">მიახლოებითი ზომა</p><p className="mt-2 text-sm font-semibold">{dimensionText({ ...suggestion.dimensions_mm, unit: "მმ" })}</p></div>
          <div className="rounded-xl border border-hooma-text/10 p-4"><p className="text-xs text-hooma-muted">ფოტოების გასუფთავება</p><p className="mt-2 text-sm font-semibold">რჩება {kept.size} · ამოსაღებია {removedCount}</p></div>
        </div>
        <div className="mt-4 rounded-xl border border-hooma-text/10 p-4"><div className="flex items-center gap-2"><Palette size={16} className="text-hooma-accent" /><p className="text-sm font-semibold">ფერები და ბეჭდვის რეჟიმი</p></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" disabled={approvalPending} onClick={() => setColorMode("customer_choice")} className={`rounded-full border px-3 py-2 text-xs font-semibold ${colorMode === "customer_choice" ? "border-hooma-accent bg-hooma-accent text-white" : "border-hooma-text/15 bg-white"}`}>მომხმარებლის ფერის არჩევანი</button><button type="button" disabled={approvalPending} onClick={() => setColorMode("fixed_multicolor")} className={`rounded-full border px-3 py-2 text-xs font-semibold ${colorMode === "fixed_multicolor" ? "border-violet-600 bg-violet-600 text-white" : "border-hooma-text/15 bg-white"}`}>მრავალფერიანი · AMS</button></div><p className="mt-3 text-xs leading-5 text-hooma-muted">{colorMode === "fixed_multicolor" ? "AMS რეჟიმში მონიშნე მინიმუმ ორი ფერი, რომლებიც მოდელს სჭირდება." : "მონიშნე ფერები, რომელთა არჩევაც მომხმარებელს შეეძლება."}</p><div className="mt-3 flex flex-wrap gap-2">{productColorOptions.map((option) => { const selected = colors.includes(option.name); return <button key={option.name} type="button" disabled={approvalPending} aria-pressed={selected} onClick={() => toggleColor(option.name)} className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-semibold transition ${selected ? "border-hooma-text bg-hooma-text text-white" : "border-hooma-text/15 bg-white text-hooma-text"}`}><span className="h-4 w-4 rounded-full border border-black/10" style={{ backgroundColor: productColorHex(option.name) }} />{option.name}{selected ? <Check size={12} /> : null}</button>; })}</div>{colors.length < (colorMode === "fixed_multicolor" ? 2 : 1) ? <p className="mt-2 text-xs font-semibold text-red-700">{colorMode === "fixed_multicolor" ? "AMS რეჟიმისთვის მინიმუმ ორი ფერი აირჩიე." : "მინიმუმ ერთი ფერი აირჩიე."}</p> : null}</div>
        <div className="mt-4"><p className="text-xs leading-5 text-hooma-muted">ფოტოზე დაჭერით თავად გადაწყვიტე დარჩეს თუ ამოიღოს. მინიმუმ ერთი ფოტო უნდა დარჩეს; თუ მთავარ ფოტოს ამოიღებ, პირველი დარჩენილი ფოტო გახდება მთავარი.</p><div className="mt-3 flex gap-2 overflow-x-auto pb-2">{images.map((url, index) => { const isKept = kept.has(url); const isHero = isKept && url === computedHero; return <button key={url} type="button" disabled={approvalPending} aria-pressed={isKept} aria-label={`ფოტო ${index + 1}: ${isHero ? "მთავარია; " : ""}${isKept ? "დარჩება, დააჭირე ამოსაღებად" : "ამოსაღებია, დააჭირე დასატოვებლად"}`} onClick={() => toggleImage(url)} className={`group relative h-28 w-36 shrink-0 overflow-hidden rounded-xl border-2 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-hooma-accent focus-visible:ring-offset-2 disabled:cursor-wait ${isKept ? "border-emerald-400" : "border-red-400 opacity-55"}`}><img src={url} alt={`აუდიტის ფოტო ${index + 1}`} className="h-full w-full object-cover" /><span className={`absolute inset-x-1 bottom-1 rounded-lg px-2 py-1 text-center text-[10px] font-semibold text-white ${isKept ? "bg-emerald-800/90" : "bg-red-900/90"}`}>{isHero ? "მთავარი · დარჩება" : isKept ? "დარჩება" : "ამოსაღებია"}</span>{!isKept ? <span className="absolute inset-0 grid place-items-center bg-red-950/20 text-white"><ImageOff size={20} /></span> : null}</button>; })}</div><p aria-live="polite" className="mt-2 text-xs text-red-700">{photoMessage}</p></div>
        {Array.isArray(item.warnings) && item.warnings.length ? <div className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-950"><strong>გაფრთხილება:</strong> {item.warnings.join(" · ")}</div> : null}
        {ready ? <div className="mt-5"><p className="mb-3 text-xs leading-5 text-sky-800">AI აუდიტი უკვე დაფიქსირებულია და ეს პროდუქტი ხელახლა აღარ გაიგზავნება. ტექსტის ცვლილებები მხოლოდ „დამტკიცების“ შემდეგ შეინახება პროდუქტში.</p><div className="flex flex-wrap gap-3"><form id={approvalFormId} action={approvalAction} onSubmit={(event) => { if (!keptImages.length || !window.confirm("დამტკიცდეს შენ მიერ შესწორებული სახელები, აღწერები, ფერები/AMS რეჟიმი, მიახლოებითი ზომა და არჩეული ფოტოები?")) event.preventDefault(); }}><input type="hidden" name="item_id" value={item.id} /><input type="hidden" name="color_mode" value={colorMode} />{colors.map((color) => <input key={color} type="hidden" name="colors" value={color} />)}{keptImages.map((url) => <input key={url} type="hidden" name="kept_image_urls" value={url} />)}<button disabled={approvalPending || !keptImages.length || colors.length < (colorMode === "fixed_multicolor" ? 2 : 1)} className="inline-flex items-center gap-2 rounded-full bg-emerald-700 px-4 py-2.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"><Check size={15} />{approvalPending ? "ინახება..." : "დამტკიცება"}</button></form><form action={rejectCatalogProductAuditItemAction} onSubmit={(event) => { if (!window.confirm("უარყოფის შემდეგ პროდუქტი ხელახლა აღარ გაივლის AI აუდიტს. გავაგრძელოთ?")) event.preventDefault(); }}><input type="hidden" name="item_id" value={item.id} /><button disabled={approvalPending} className="inline-flex items-center gap-2 rounded-full border border-red-200 px-4 py-2.5 text-xs font-semibold text-red-800 disabled:opacity-50"><X size={15} />უარყოფა</button></form></div>{approvalState.message ? <p role="alert" aria-live="polite" className={`mt-3 text-xs leading-5 ${approvalState.ok ? "text-emerald-800" : "text-red-800"}`}>{approvalState.message}</p> : null}</div> : null}
      </> : null}
      {item.error_message ? <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-800">{item.error_message}</p> : null}
      <div className="mt-5 border-t border-hooma-text/10 pt-4"><DeleteProductFromAuditButton itemId={item.id} productName={currentName} /></div>
    </article>
  );
}

function BulkApproval({ jobs }: { jobs: AuditJob[] }) {
  const [state, action, pending] = useActionState(applyHighConfidenceCatalogAuditsAction, {});
  const eligibleJobs = jobs.filter((job) => job.ready_count > 0);
  if (!eligibleJobs.length) return null;
  return (
    <form action={action} className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3"><TriangleAlert size={20} className="mt-0.5 shrink-0 text-amber-800" /><div><h3 className="font-semibold text-amber-950">მაღალი სანდოობის ჯგუფური დამტკიცება</h3><p className="mt-1 text-sm leading-6 text-amber-900">ერთ მოქმედებაზე დამტკიცდება მაქსიმუმ 100 შედეგი, მხოლოდ 85%+ სანდოობით და გაფრთხილების გარეშე. ჯგუფური მოქმედება გამოიყენებს AI-ის უცვლელ ტექსტებს; ხელით რედაქტირებული ტექსტი ინახება მხოლოდ კონკრეტული ქარდის „დამტკიცების“ ღილაკით.</p></div></div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_180px_auto]"><select name="job_id" required className={inputClass}><option value="">აირჩიე აუდიტი</option>{eligibleJobs.map((job) => <option key={job.id} value={job.id}>{new Date(job.created_at).toLocaleDateString("ka-GE")} · მზადაა {job.ready_count}</option>)}</select><input name="confirmation" required placeholder="ჩაწერე APPLY" className={inputClass} /><button disabled={pending} className="mt-2 rounded-2xl bg-amber-900 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{pending ? "მუშავდება..." : "ჯგუფური დამტკიცება"}</button></div>
      {state.message ? <p className={`mt-3 text-sm ${state.ok ? "text-emerald-800" : "text-red-800"}`}>{state.message}</p> : null}
    </form>
  );
}

export function CatalogProductAuditConsole({
  agents,
  jobs,
  items,
  migrationReady,
}: {
  agents: Agent[];
  jobs: AuditJob[];
  items: AuditItem[];
  migrationReady: boolean;
}) {
  const [state, createJob, pending] = useActionState(createCatalogProductAuditJobAction, {});
  const activeAgents = agents.filter((agent) => agent.is_active);
  const agentNames = new Map(agents.map((agent) => [agent.id, agent.name]));

  return (
    <section className="space-y-6 border-t border-hooma-text/10 pt-8">
      <div><div className="flex items-center gap-2 text-hooma-accent"><Sparkles size={19} /><p className="text-xs font-semibold uppercase tracking-[0.22em]">Catalog quality auditor</p></div><h2 className="mt-3 text-3xl font-semibold">ავტომატური ტექსტი, ზომა, მედია, ფერები და AMS</h2><p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">Audit Agent keyset-რიგით გაივლის მხოლოდ აუდიტ-გაუვლელ პროდუქტებს, ამოწმებს საჯარო რეფერენსსა და ფოტოებს და სანდო, გაფრთხილების გარეშე შედეგს ავტომატურად იყენებს. დაბალი სანდოობის ან წინააღმდეგობრივი შემთხვევა აქ რჩება ხელით გადასამოწმებლად და OpenAI-ში მეორედ აღარ იგზავნება.</p></div>

      {!migrationReady ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong>Catalog Product Auditor migration ჯერ არ არის გაშვებული.</strong></div> : null}

      <form action={createJob} className="rounded-[1.75rem] bg-white/75 p-6 shadow-soft">
        <div className="flex items-start gap-3"><span className="rounded-2xl bg-hooma-accent/10 p-3 text-hooma-accent"><Bot size={22} /></span><div><h3 className="text-xl font-semibold">აუდიტ-გაუვლელი პროდუქტების გაშვება</h3><p className="mt-1 text-sm leading-6 text-hooma-muted">საჯარო რეფერენს-გვერდის, ფოტოებისა და არსებული მონაცემების მიხედვით გასწორდება სახელი, აღწერა, ზომა, მედია, ფერები და AMS რეჟიმი. მაღალი სანდოობის შედეგი ავტომატურად დამტკიცდება; უკვე მიღებული შედეგი აღარ დამუშავდება მეორედ.</p></div></div>
        <div className="mt-5 grid gap-4 md:grid-cols-2"><label className="text-sm font-medium">Catalog Agent<select name="agent_id" required className={inputClass}><option value="">აირჩიე</option>{activeAgents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}</select></label><fieldset><legend className="text-sm font-medium">პროდუქტის სტატუსები</legend><div className="mt-2 flex flex-wrap gap-2">{[["active", "გამოქვეყნებული"], ["draft", "Draft"], ["archived", "არქივი"]].map(([value, label]) => <label key={value} className="flex items-center gap-2 rounded-full border border-hooma-text/10 bg-white px-4 py-2.5 text-sm"><input type="checkbox" name="product_statuses" value={value} defaultChecked={value !== "archived"} className="accent-hooma-accent" />{label}</label>)}</div></fieldset></div>
        <button disabled={pending || !activeAgents.length || !migrationReady} className="mt-5 inline-flex items-center gap-2 rounded-full bg-hooma-accent px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"><Play size={16} />{pending ? "იქმნება..." : "აუდიტის გაშვება"}</button>
        {state.message ? <p className={`mt-4 rounded-xl p-4 text-sm ${state.ok ? "bg-emerald-50 text-emerald-900" : "bg-red-50 text-red-900"}`}>{state.message}</p> : null}
      </form>

      <div className="overflow-hidden rounded-[1.75rem] bg-white/75 shadow-soft"><div className="p-6"><h3 className="text-xl font-semibold">აუდიტის პროგრესი</h3></div><div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="bg-hooma-panel text-xs uppercase tracking-[0.12em] text-hooma-muted"><tr><th className="px-5 py-4">აუდიტი</th><th className="px-5 py-4">სტატუსი</th><th className="px-5 py-4">პროგრესი</th><th className="px-5 py-4">შედეგი</th><th className="px-5 py-4">მართვა</th></tr></thead><tbody className="divide-y divide-hooma-text/10">{jobs.length ? jobs.map((job) => <tr key={job.id}><td className="px-5 py-4"><p className="font-semibold">{job.product_statuses.join(" · ")}</p><p className="mt-1 text-xs text-hooma-muted">{agentNames.get(job.agent_id) || "Agent"}{job.worker_name ? ` · ${job.worker_name}` : ""}</p></td><td className="px-5 py-4"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${job.status === "completed" ? "bg-emerald-100 text-emerald-800" : job.status === "running" ? "bg-sky-100 text-sky-800" : job.status === "failed" ? "bg-red-100 text-red-800" : "bg-hooma-panel text-hooma-muted"}`}>{job.status === "running" ? <Clock3 size={13} /> : job.status === "completed" ? <CheckCircle2 size={13} /> : null}{auditStatusLabel[job.status] ?? job.status}</span>{job.error_message ? <p className="mt-1 text-xs text-red-700">{job.error_message}</p> : null}</td><td className="px-5 py-4"><span className="font-semibold">{number.format(job.processed_count)}/{number.format(job.total_count)}</span><div className="mt-2 h-1.5 w-40 overflow-hidden rounded-full bg-hooma-panel"><div className="h-full rounded-full bg-hooma-accent" style={{ width: `${job.total_count ? Math.min(100, (job.processed_count / job.total_count) * 100) : 0}%` }} /></div></td><td className="px-5 py-4 text-xs leading-5"><span className="text-amber-800">მზადაა {job.ready_count}</span> · <span className="text-emerald-800">დამტკიცდა {job.applied_count}</span><br /><span className="text-hooma-muted">უარი {job.rejected_count} · გამოტოვებული {job.skipped_count} · შეცდომა {job.failed_count}</span></td><td className="px-5 py-4">{["queued", "running"].includes(job.status) ? <form action={cancelCatalogProductAuditJobAction}><input type="hidden" name="job_id" value={job.id} /><button className="inline-flex items-center gap-1 text-xs font-semibold text-red-700"><OctagonX size={14} />გაუქმება</button></form> : "—"}</td></tr>) : <tr><td colSpan={5} className="px-5 py-10 text-center text-hooma-muted">აუდიტი ჯერ არ გაშვებულა.</td></tr>}</tbody></table></div></div>

      <BulkApproval jobs={jobs} />

      <div><div className="mb-4 flex items-center gap-2"><Ruler size={19} className="text-hooma-accent" /><h3 className="text-xl font-semibold">ბოლო შედეგები</h3></div><div className="grid gap-4">{items.length ? items.map((item) => <AuditItemCard key={item.id} item={item} />) : <div className="rounded-2xl bg-hooma-panel p-8 text-center text-sm text-hooma-muted">აგენტის წინადადებები აქ გამოჩნდება.</div>}</div></div>
    </section>
  );
}
