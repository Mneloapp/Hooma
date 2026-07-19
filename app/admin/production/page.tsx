import { randomUUID } from "node:crypto";
import {
  Box,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ExternalLink,
  PackageCheck,
  Printer,
  ScanLine,
  Send,
  Settings2,
} from "lucide-react";
import { redirect } from "next/navigation";
import { OperationsAutoRefresh } from "@/components/admin/OperationsAutoRefresh";
import {
  approveOrderQcAction,
  assignPrintJobAction,
  completePrintJobAction,
  failPrintJobAction,
  handoffOrderToCourierAction,
  markOrderDeliveredAction,
  registerPrinterAction,
  releasePrintAssignmentAction,
  setPrinterStatusAction,
  startPhysicalPrintAction,
} from "./actions";
import { printerStatusLabels, safeMakerWorldUrl, uuidPattern } from "@/lib/production/manual-workflow";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePermission } from "@/lib/supabase/server";

type PrinterRow = {
  id: string;
  name: string;
  model: string;
  serial_number_masked: string | null;
  status: string;
  is_active: boolean;
};

type JobRow = {
  id: string;
  order_item_id: string;
  printer_id: string | null;
  status: string;
  unit_number: number;
  plate_number: number;
  attempt_number: number;
  source_url: string | null;
  source_platform: string | null;
  product_name_snapshot: string | null;
  sku_snapshot: string | null;
  variant_snapshot: string | null;
  print_profile_path: string | null;
  estimated_minutes: number | null;
  material: string | null;
  color: string | null;
  operator_notes: string | null;
  assigned_operator_id: string | null;
  lock_version: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type ItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  variant_id: string | null;
  product_name: string | null;
  sku: string | null;
  size_label: string | null;
  material: string | null;
  color: string | null;
  quantity: number;
};

type OrderRow = {
  id: string;
  tracking_code: string | null;
  fulfillment_status: string;
  payment_status: string;
  test_mode: boolean;
  promised_at: string | null;
  delivery_address: Record<string, unknown> | null;
  created_at: string;
};

const dateFormat = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium", timeStyle: "short" });

function orderLabel(order: OrderRow | undefined) {
  return order?.tracking_code ? `#${order.tracking_code}` : order ? `#${order.id.slice(0, 8).toUpperCase()}` : "შეკვეთა";
}

function statusTone(status: string) {
  if (status === "idle") return "bg-emerald-100 text-emerald-900";
  if (status === "busy") return "bg-blue-100 text-blue-900";
  if (status === "maintenance") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-slate-800";
}

function safeOperatorReferenceUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function deliveryMapUrl(order: OrderRow) {
  const value = order.delivery_address?.google_maps_url;
  return typeof value === "string" && value.startsWith("https://www.google.com/maps/") ? value : null;
}

function OperatorReference({ value }: { value?: string }) {
  const url = safeOperatorReferenceUrl(value);
  if (!value) return <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>ოპერატორის რეფერენსი არ არის.</strong> პროდუქტის Draft-ში დაამატე ბმული ან შიდა ინსტრუქცია.</div>;
  return <div className="mt-4 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Private operator reference</p>{url ? <a href={url} target="_blank" rel="noreferrer noopener" className="mt-3 inline-flex items-center gap-2 rounded-full bg-blue-950 px-4 py-2 font-semibold text-white"><ExternalLink size={14} />რეფერენსის გახსნა</a> : <p className="mt-3 whitespace-pre-wrap leading-6 text-blue-900/80">{value}</p>}</div>;
}

function AmsProductionProfile({ attributes }: { attributes?: Record<string, unknown> }) {
  const palette = Array.isArray(attributes?.fixed_color_palette) ? attributes.fixed_color_palette.filter((color): color is string => typeof color === "string") : [];
  const amsRequired = attributes?.ams_required === true && attributes?.color_mode === "fixed_multicolor" && palette.length >= 2;
  if (!amsRequired) return null;
  return <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950"><div className="flex items-center gap-2"><strong>AMS აუცილებელია</strong><span className="rounded-full bg-violet-900 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white">Fixed multicolor</span></div><p className="mt-2 text-xs leading-5 text-violet-900/75">ჩატვირთე ეს ფერები AMS-ში და დაბეჭდე რეფერენსის/ფოტოს ფიქსირებული კომბინაციით:</p><p className="mt-2 font-semibold">{palette.join(" · ")}</p></div>;
}

export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string; order?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("production.manage");
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/admin/production");
  const admin = createAdminClient() as any;

  const selectedOrderId = params.order && uuidPattern.test(params.order) ? params.order : null;
  const printerQuery = admin?.from("printers").select("id,name,model,serial_number_masked,status,is_active").eq("is_active", true).order("name");
  let orderQuery = admin?.from("orders")
    .select("id,tracking_code,fulfillment_status,payment_status,test_mode,promised_at,delivery_address,created_at")
    .in("fulfillment_status", ["production_queued", "in_production", "quality_check", "ready_for_delivery", "out_for_delivery"])
    .order("created_at", { ascending: true })
    .limit(500);
  if (selectedOrderId) orderQuery = orderQuery.eq("id", selectedOrderId);
  const [{ data: printerRows, error: printerError }, { data: orderRows, error: orderError }] = admin
    ? await Promise.all([printerQuery, orderQuery])
    : [{ data: [], error: null }, { data: [], error: null }];

  const printers = (printerRows ?? []) as PrinterRow[];
  const orders = (orderRows ?? []) as OrderRow[];
  const orderIds = orders.map((order) => order.id);
  const { data: itemRows, error: itemError } = admin && orderIds.length
    ? await admin.from("order_items").select("id,order_id,product_id,variant_id,product_name,sku,size_label,material,color,quantity").in("order_id", orderIds).order("created_at")
    : { data: [], error: null };
  const items = (itemRows ?? []) as ItemRow[];
  const productIds = Array.from(new Set(items.map((item) => item.product_id).filter((id): id is string => Boolean(id))));
  const { data: operatorReferenceRows, error: operatorReferenceError } = admin && productIds.length
    ? await admin.from("product_operator_references").select("product_id,reference").in("product_id", productIds)
    : { data: [], error: null };
  const operatorReferencesByProduct = new Map<string, string>((operatorReferenceRows ?? []).map((row: { product_id: string; reference: string }) => [row.product_id, row.reference]));
  const variantIds = Array.from(new Set(items.map((item) => item.variant_id).filter((id): id is string => Boolean(id))));
  const { data: productionVariantRows, error: productionVariantError } = admin && variantIds.length
    ? await admin.from("product_variants").select("id,attributes").in("id", variantIds)
    : { data: [], error: null };
  const productionVariantAttributes = new Map<string, Record<string, unknown>>((productionVariantRows ?? []).map((row: { id: string; attributes: Record<string, unknown> | null }) => [row.id, row.attributes ?? {}]));
  const itemIds = items.map((item) => item.id);
  const { data: jobRows, error: jobError } = admin && itemIds.length
    ? await admin
      .from("print_jobs")
      .select("id,order_item_id,printer_id,status,unit_number,plate_number,attempt_number,source_url,source_platform,product_name_snapshot,sku_snapshot,variant_snapshot,print_profile_path,estimated_minutes,material,color,operator_notes,assigned_operator_id,lock_version,started_at,completed_at,created_at")
      .in("order_item_id", itemIds)
      .order("created_at")
      .limit(2000)
    : { data: [], error: null };
  const jobs = (jobRows ?? []) as JobRow[];
  const operatorIds = Array.from(new Set(jobs.map((job) => job.assigned_operator_id).filter((id): id is string => Boolean(id))));
  const { data: operatorRows } = admin && operatorIds.length
    ? await admin.from("profiles").select("id,full_name,email").in("id", operatorIds)
    : { data: [] };
  const operatorsById = new Map<string, string>(
    (operatorRows ?? []).map((operator: { id: string; full_name: string | null; email: string | null }) => [
      operator.id,
      operator.full_name || operator.email || "ოპერატორი",
    ]),
  );

  const itemsById = new Map(items.map((item) => [item.id, item]));
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  const printersById = new Map(printers.map((printer) => [printer.id, printer]));
  const jobsByOrder = new Map<string, JobRow[]>();
  for (const job of jobs) {
    const orderId = itemsById.get(job.order_item_id)?.order_id;
    if (orderId) jobsByOrder.set(orderId, [...(jobsByOrder.get(orderId) ?? []), job]);
  }

  const waitingJobs = jobs.filter((job) => ["awaiting_approval", "queued"].includes(job.status));
  const preparingJobs = jobs.filter((job) => job.status === "preparing");
  const activeJobs = jobs.filter((job) => ["printing", "paused"].includes(job.status));
  const waitingForOtherPrints = jobs.filter((job) => job.status === "completed");
  const qcOrders = orders.filter((order) => order.fulfillment_status === "quality_check");
  const courierOrders = orders.filter((order) => order.fulfillment_status === "ready_for_delivery");
  const deliveryOrders = orders.filter((order) => order.fulfillment_status === "out_for_delivery");
  const idlePrinters = printers.filter((printer) => printer.status === "idle");
  const errorsPresent = printerError || orderError || itemError || operatorReferenceError || productionVariantError || jobError;

  const stages = [
    ["რიგში / მინიჭებული", waitingJobs.length + preparingJobs.length, Clock3],
    ["იბეჭდება", activeJobs.length, Printer],
    ["ხარისხის კონტროლი", qcOrders.length, ScanLine],
    ["კურიერისთვის მზად", courierOrders.length, CheckCircle2],
  ] as const;

  return (
    <div className="space-y-7">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div><p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Windows ოპერატორული კონსოლი</p><h1 className="mt-3 text-4xl font-medium">წარმოების მართვა</h1><p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">Hooma მართავს შეკვეთას, პასუხისმგებელ ოპერატორსა და მომხმარებლის tracking-ს. ფიზიკურ პრინტერს ამ ეტაპზე მართავ Bambu Studio-დან ამავე Windows კომპიუტერზე.</p></div>
        <OperationsAutoRefresh />
      </div>

      {params.notice ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.notice}</p> : null}
      {params.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{params.error}</p> : null}
      {selectedOrderId ? <div className="flex flex-col justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-950 sm:flex-row sm:items-center"><span><strong>კანბანიდან გახსნილი შეკვეთა:</strong> ნაჩვენებია მხოლოდ #{orders[0]?.tracking_code ?? selectedOrderId.slice(0, 8).toUpperCase()}-ის წარმოების სამუშაოები.</span><a href="/admin/production" className="font-semibold underline underline-offset-4">ყველა სამუშაოს ჩვენება</a></div> : null}
      {errorsPresent ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">წარმოების მონაცემების ნაწილი ვერ ჩაიტვირთა. დარწმუნდი, რომ ბოლო Supabase migration გამოყენებულია.</p> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stages.map(([label, value, StageIcon]) => (
          <div key={label} className="rounded-[1.5rem] bg-white/75 p-5 shadow-soft">
            <StageIcon size={19} className="text-hooma-accent" />
            <p className="mt-6 text-sm text-hooma-muted">{label}</p>
            <p className="mt-2 text-3xl font-medium">{value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-5 text-blue-950">
        <div className="flex items-start gap-3"><CircleAlert size={20} className="mt-0.5 shrink-0" /><div><h2 className="font-semibold">V1 სამუშაო წესი — თანმიმდევრობა მნიშვნელოვანია</h2><p className="mt-2 text-sm leading-6 text-blue-900/80"><strong>ჯერ Hooma-ში დაჯავშნე პრინტერი.</strong> მხოლოდ წარმატებული ჯავშნის შემდეგ გახსენი ოპერატორის რეფერენსი და გაუშვი სწორი ფერი/მასალა Bambu Studio-დან. როცა ფიზიკური ბეჭდვა ნამდვილად დაიწყება, მეორე ნაბიჯზე დაადასტურე დაწყება. ასე ორი ოპერატორი ერთ სამუშაოს ორჯერ ვერ გაუშვებს. მომხმარებელს ეს შიდა მოქმედებები არ უჩანს.</p></div></div>
      </section>

      <section className="space-y-4">
        <div><p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">1. სამუშაო რიგი</p><h2 className="mt-2 text-2xl font-semibold">პრინტერზე გასაშვები</h2></div>
        <div className="grid gap-4 xl:grid-cols-2">
          {waitingJobs.map((job) => {
            const item = itemsById.get(job.order_item_id);
            const order = item ? ordersById.get(item.order_id) : undefined;
            const sourceUrl = safeMakerWorldUrl(job.source_url);
            const operatorReference = item?.product_id ? operatorReferencesByProduct.get(item.product_id) : undefined;
            const colorProfile = item?.variant_id ? productionVariantAttributes.get(item.variant_id) : undefined;
            return (
              <article key={job.id} className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-xs font-semibold text-hooma-accent">{orderLabel(order)} · ერთეული {job.unit_number} · plate {job.plate_number}{job.attempt_number > 1 ? ` · retry ${job.attempt_number}` : ""}</p><h3 className="mt-2 text-xl font-semibold">{job.product_name_snapshot || item?.product_name || "ინდივიდუალური პროდუქტი"}</h3><p className="mt-1 text-xs text-hooma-muted">{job.sku_snapshot || item?.sku || "Custom"}{job.variant_snapshot || item?.size_label ? ` · ${job.variant_snapshot || item?.size_label}` : ""}</p></div>
                  <span className="rounded-full bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-900">დადასტურებას ელოდება</span>
                </div>

                <div className="mt-4 grid gap-2 rounded-2xl bg-hooma-background p-4 text-sm sm:grid-cols-3">
                  <p><span className="block text-xs text-hooma-muted">ფერი</span><strong>{job.color || item?.color || "—"}</strong></p>
                  <p><span className="block text-xs text-hooma-muted">მასალა</span><strong>{job.material || item?.material || "—"}</strong></p>
                  <p><span className="block text-xs text-hooma-muted">სავარაუდო დრო</span><strong>{job.estimated_minutes ? `${job.estimated_minutes} წთ` : "შეამოწმე Studio-ში"}</strong></p>
                </div>

                <OperatorReference value={operatorReference} />
                <AmsProductionProfile attributes={colorProfile} />

                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                  {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-full border border-hooma-text/15 bg-white px-4 py-2 font-semibold hover:border-hooma-accent"><ExternalLink size={15} />ძველი წყაროს გახსნა</a> : null}
                  <span className="text-xs text-hooma-muted">3MF profile: {job.print_profile_path ? "დამაგრებულია" : "ოპერატორის რეფერენსიდან"}</span>
                </div>

                <form action={assignPrintJobAction} className="mt-5 flex flex-col gap-3 rounded-2xl border border-hooma-text/10 bg-hooma-panel/60 p-4 sm:flex-row sm:items-end">
                  <input type="hidden" name="job_id" value={job.id} />
                  <input type="hidden" name="lock_version" value={job.lock_version} />
                  <input type="hidden" name="operation_key" value={randomUUID()} />
                  <label className="flex-1 text-sm font-semibold">Hooma-ში დასაჯავშნი პრინტერი<select name="printer_id" required defaultValue="" className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent"><option value="" disabled>აირჩიე თავისუფალი პრინტერი</option>{idlePrinters.map((printer) => <option key={printer.id} value={printer.id}>{printer.name} · {printer.model}</option>)}</select></label>
                  <button disabled={!idlePrinters.length} className="min-h-11 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40">1. პრინტერის დაჯავშნა</button>
                </form>
              </article>
            );
          })}
          {!waitingJobs.length ? <div className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/55 px-6 py-12 text-center xl:col-span-2"><Box className="mx-auto text-hooma-muted" /><p className="mt-4 font-semibold">გასაშვები სამუშაო არ არის</p><p className="mt-2 text-sm text-hooma-muted">Orders გვერდზე ოპერატორის მიერ დადასტურებული შეკვეთა აქ გამოჩნდება.</p></div> : null}
        </div>
      </section>

      <section className="space-y-4">
        <div><p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">2. პრინტერი დაჯავშნილია</p><h2 className="mt-2 text-2xl font-semibold">Bambu Studio-ში გასაშვები</h2></div>
        <div className="grid gap-4 xl:grid-cols-2">
          {preparingJobs.map((job) => {
            const item = itemsById.get(job.order_item_id);
            const order = item ? ordersById.get(item.order_id) : undefined;
            const printer = job.printer_id ? printersById.get(job.printer_id) : undefined;
            const sourceUrl = safeMakerWorldUrl(job.source_url);
            const operatorReference = item?.product_id ? operatorReferencesByProduct.get(item.product_id) : undefined;
            const colorProfile = item?.variant_id ? productionVariantAttributes.get(item.variant_id) : undefined;
            return (
              <article key={job.id} className="rounded-[1.5rem] border border-violet-200 bg-violet-50 p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold text-violet-900">{orderLabel(order)} · ერთეული {job.unit_number} · plate {job.plate_number}{job.attempt_number > 1 ? ` · retry ${job.attempt_number}` : ""}</p><h3 className="mt-2 text-xl font-semibold">{job.product_name_snapshot || item?.product_name || "პროდუქტი"}</h3><p className="mt-2 text-sm text-violet-900/75">{job.color || item?.color || "ფერი —"} · {job.material || item?.material || "მასალა —"}</p><p className="mt-2 text-xs text-violet-900/65">მიანიჭა: {job.assigned_operator_id ? operatorsById.get(job.assigned_operator_id) || "ოპერატორი" : "—"}</p></div><div className="rounded-2xl bg-white/75 px-4 py-3 text-sm"><span className="block text-xs text-hooma-muted">დაჯავშნილი პრინტერი</span><strong>{printer?.name || "მინიჭებულია"}</strong><span className="ml-1 text-xs text-hooma-muted">{printer?.model}</span></div></div>
                <OperatorReference value={operatorReference} /><AmsProductionProfile attributes={colorProfile} /><div className="mt-4 flex flex-wrap items-center gap-3">{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noreferrer noopener" className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold"><ExternalLink size={15} />ძველი წყაროს გახსნა</a> : null}<span className="text-xs text-violet-900/70">ჯერ გაუშვი ამ დაჯავშნილ პრინტერზე Bambu Studio-დან.</span></div>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
                  <form action={startPhysicalPrintAction}>
                    <input type="hidden" name="job_id" value={job.id} /><input type="hidden" name="lock_version" value={job.lock_version} /><input type="hidden" name="operation_key" value={randomUUID()} />
                    <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-violet-950 px-5 text-sm font-semibold text-white"><Printer size={17} />2. ფიზიკური ბეჭდვა დაიწყო</button>
                  </form>
                  <details className="rounded-2xl border border-violet-200 bg-white/70 p-3 text-sm"><summary className="cursor-pointer font-semibold">ჯავშნის მოხსნა</summary><form action={releasePrintAssignmentAction} className="mt-3 grid gap-2"><input type="hidden" name="job_id" value={job.id} /><input type="hidden" name="lock_version" value={job.lock_version} /><input type="hidden" name="operation_key" value={randomUUID()} /><select name="release_reason" required defaultValue="" className="rounded-xl border border-violet-200 bg-white px-3 py-2"><option value="" disabled>მიზეზი</option><option value="Printer unavailable during preflight">პრინტერი მიუწვდომელია</option><option value="Material or color unavailable">ფერი / მასალა არ არის</option><option value="Profile requires correction">პროფილი შესასწორებელია</option><option value="Assignment made by mistake">შეცდომით მიენიჭა</option></select><button className="rounded-full border border-violet-300 px-4 py-2 text-xs font-semibold">დააბრუნე რიგში</button></form></details>
                </div>
              </article>
            );
          })}
          {!preparingJobs.length ? <p className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/55 p-8 text-center text-sm text-hooma-muted xl:col-span-2">დაჯავშნილი და ჯერ გაუშვებელი სამუშაო არ არის.</p> : null}
        </div>
      </section>

      <section className="space-y-4">
        <div><p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">3. მიმდინარე ბეჭდვა</p><h2 className="mt-2 text-2xl font-semibold">პრინტერზეა</h2></div>
        <div className="grid gap-4 xl:grid-cols-2">
          {activeJobs.map((job) => {
            const item = itemsById.get(job.order_item_id);
            const order = item ? ordersById.get(item.order_id) : undefined;
            const printer = job.printer_id ? printersById.get(job.printer_id) : undefined;
            return (
              <article key={job.id} className="rounded-[1.5rem] border border-blue-200 bg-blue-50/80 p-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="text-xs font-semibold text-blue-800">{orderLabel(order)} · ერთეული {job.unit_number} · plate {job.plate_number}{job.attempt_number > 1 ? ` · retry ${job.attempt_number}` : ""}</p><h3 className="mt-2 text-xl font-semibold">{job.product_name_snapshot || item?.product_name || "პროდუქტი"}</h3><p className="mt-2 text-sm text-blue-900/70">{job.color || item?.color || "ფერი —"} · {job.material || item?.material || "მასალა —"}</p></div><div className="rounded-2xl bg-white/70 px-4 py-3 text-sm"><span className="block text-xs text-hooma-muted">პრინტერი</span><strong>{printer?.name || "მინიჭებულია"}</strong><span className="ml-1 text-xs text-hooma-muted">{printer?.model}</span></div></div>
                <p className="mt-4 text-xs text-blue-900/70">დაწყება: {job.started_at ? dateFormat.format(new Date(job.started_at)) : "—"}</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-start">
                  <form action={completePrintJobAction}>
                    <input type="hidden" name="job_id" value={job.id} />
                    <input type="hidden" name="lock_version" value={job.lock_version} />
                    <input type="hidden" name="operation_key" value={randomUUID()} />
                    <button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-950 px-5 text-sm font-semibold text-white"><CheckCircle2 size={17} />ბეჭდვა ფიზიკურად დასრულდა</button>
                  </form>
                  <details className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-950">
                    <summary className="cursor-pointer font-semibold">ბეჭდვა წარუმატებელია</summary>
                    <form action={failPrintJobAction} className="mt-3 grid gap-2">
                      <input type="hidden" name="job_id" value={job.id} />
                      <input type="hidden" name="lock_version" value={job.lock_version} />
                      <input type="hidden" name="operation_key" value={randomUUID()} />
                      <select name="failure_reason" required defaultValue="" className="rounded-xl border border-red-200 bg-white px-3 py-2"><option value="" disabled>აირჩიე მიზეზი</option><option value="First layer or adhesion failure">პირველი ფენა / მიწებება</option><option value="Filament or material failure">ფილამენტი / მასალა</option><option value="Printer or power interruption">პრინტერი / დენის გათიშვა</option><option value="Geometry or quality failure">გეომეტრია / ხარისხი</option><option value="Operator stopped the print">ოპერატორმა გააჩერა</option></select>
                      <button className="rounded-full bg-red-900 px-4 py-2.5 text-xs font-semibold text-white">შეინახე failure და შექმენი retry</button>
                    </form>
                  </details>
                </div>
              </article>
            );
          })}
          {!activeJobs.length ? <p className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/55 p-8 text-center text-sm text-hooma-muted xl:col-span-2">ამ წუთას არცერთი ბეჭდვა არ არის მონიშნული აქტიურად.</p> : null}
        </div>
        {waitingForOtherPrints.length ? <p className="rounded-2xl bg-hooma-panel p-4 text-sm"><strong>{waitingForOtherPrints.length} სამუშაო დასრულებულია</strong> და იმავე შეკვეთის დანარჩენ ბეჭდვებს ელოდება.</p> : null}
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="space-y-4">
          <div><p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">4. ხარისხი</p><h2 className="mt-2 text-2xl font-semibold">QC დასადასტურებელი</h2></div>
          {qcOrders.map((order) => (
            <article key={order.id} className="rounded-[1.5rem] border border-emerald-200 bg-emerald-50 p-5">
              <p className="text-xs font-semibold text-emerald-900">{orderLabel(order)}</p><h3 className="mt-2 text-xl font-semibold">ყველა ბეჭდვა დასრულებულია</h3><p className="mt-2 text-sm leading-6 text-emerald-900/75">შეამოწმე ზედაპირი, ზომა, ფერი, რაოდენობა და შეფუთვის მზადყოფნა. სამუშაოები: {jobsByOrder.get(order.id)?.length ?? 0}.</p>
              <form action={approveOrderQcAction} className="mt-5"><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="operation_key" value={randomUUID()} /><button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-emerald-950 px-5 text-sm font-semibold text-white"><PackageCheck size={17} />ხარისხი დადასტურებულია</button></form>
            </article>
          ))}
          {!qcOrders.length ? <p className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/55 p-8 text-center text-sm text-hooma-muted">QC-ს მომლოდინე შეკვეთა არ არის.</p> : null}
        </div>

        <div className="space-y-4">
          <div><p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">5. მიწოდება</p><h2 className="mt-2 text-2xl font-semibold">კურიერზე გადასაცემი</h2></div>
          {courierOrders.map((order) => (
            <article key={order.id} className="rounded-[1.5rem] border border-violet-200 bg-violet-50 p-5">
              <p className="text-xs font-semibold text-violet-900">{orderLabel(order)}</p><h3 className="mt-2 text-xl font-semibold">შეფუთული და მზადაა</h3><p className="mt-2 text-sm text-violet-900/75">ეს ღილაკი გამოიყენე მხოლოდ მას შემდეგ, რაც კურიერმა შეკვეთა რეალურად ჩაიბარა.</p>
              {deliveryMapUrl(order) ? <a href={deliveryMapUrl(order)!} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-4 py-2 text-sm font-semibold text-violet-950"><ExternalLink size={15} />მომხმარებლის ზუსტი ლოკაცია</a> : <p className="mt-4 rounded-xl bg-white/60 px-3 py-2 text-xs text-violet-900/70">ზუსტი რუკის ლოკაცია არ არის მითითებული.</p>}
              <form action={handoffOrderToCourierAction} className="mt-5 grid gap-3 sm:grid-cols-2">
                <input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="operation_key" value={randomUUID()} />
                <label className="text-sm font-semibold">საკურიერო კომპანია<input name="courier_name" placeholder="მაგ. Hooma Courier" className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 font-normal outline-none" /></label>
                <label className="text-sm font-semibold">კურიერის კოდი (თუ არის)<input name="courier_reference" className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5 font-normal outline-none" /></label>
                <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-violet-950 px-5 text-sm font-semibold text-white sm:col-span-2 sm:w-fit"><Send size={17} />რეალურად გადაეცა კურიერს</button>
              </form>
            </article>
          ))}
          {deliveryOrders.map((order) => (
            <article key={order.id} className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-5">
              <p className="text-xs font-semibold text-blue-900">{orderLabel(order)}</p><h3 className="mt-2 text-xl font-semibold">საკურიერო მომსახურებასთანაა</h3><p className="mt-2 text-sm text-blue-900/75">მიწოდებულად მონიშნე მხოლოდ კურიერისგან მიღებული რეალური დადასტურების შემდეგ.</p>
              <form action={markOrderDeliveredAction} className="mt-5"><input type="hidden" name="order_id" value={order.id} /><input type="hidden" name="operation_key" value={randomUUID()} /><button className="inline-flex min-h-11 items-center gap-2 rounded-full bg-blue-950 px-5 text-sm font-semibold text-white"><CheckCircle2 size={17} />მიწოდება დადასტურებულია</button></form>
            </article>
          ))}
          {!courierOrders.length && !deliveryOrders.length ? <p className="rounded-[1.5rem] border border-dashed border-hooma-text/15 bg-white/55 p-8 text-center text-sm text-hooma-muted">კურიერისთვის მზად შეკვეთა არ არის.</p> : null}
        </div>
      </section>

      <section className="space-y-4 border-t border-hooma-text/10 pt-7">
        <div><p className="text-xs uppercase tracking-[0.24em] text-hooma-muted">პრინტერების რეესტრი</p><h2 className="mt-2 text-2xl font-semibold">Bambu Lab პრინტერები</h2><p className="mt-2 text-sm text-hooma-muted">სტატუსი V1-ში ოპერატორის მიერაა მითითებული — ეს ჯერ არ არის პრინტერის live telemetry.</p></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {printers.map((printer) => (
            <article key={printer.id} className="rounded-2xl border border-hooma-text/10 bg-white/75 p-4">
              <div className="flex items-start justify-between gap-3"><div><h3 className="font-semibold">{printer.name}</h3><p className="mt-1 text-xs text-hooma-muted">{printer.model}{printer.serial_number_masked ? ` · ${printer.serial_number_masked}` : ""}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(printer.status)}`}>{printerStatusLabels[printer.status] ?? printer.status}</span></div>
              {printer.status !== "busy" ? <form action={setPrinterStatusAction} className="mt-4 flex gap-2"><input type="hidden" name="printer_id" value={printer.id} /><input type="hidden" name="operation_key" value={randomUUID()} /><select name="status" defaultValue={printer.status} className="min-w-0 flex-1 rounded-xl border border-hooma-text/10 bg-white px-2 py-2 text-xs"><option value="idle">თავისუფალი</option><option value="maintenance">მომსახურება</option><option value="offline">ოფლაინ</option></select><button className="rounded-xl border border-hooma-text/10 px-3 text-xs font-semibold">შენახვა</button></form> : <p className="mt-4 text-xs text-hooma-muted">სტატუსი ბეჭდვის დასრულებისას გათავისუფლდება.</p>}
            </article>
          ))}
          {!printers.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 bg-white/55 p-6 text-sm text-hooma-muted sm:col-span-2 xl:col-span-4">ჯერ არცერთი პრინტერი არ არის დამატებული.</p> : null}
        </div>

        <form action={registerPrinterAction} className="grid gap-4 rounded-[1.5rem] border border-hooma-text/10 bg-white/75 p-5 md:grid-cols-4">
          <input type="hidden" name="operation_key" value={randomUUID()} />
          <label className="text-sm font-semibold">შიდა სახელი<input name="name" required placeholder="მაგ. A1-01" className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent" /></label>
          <label className="text-sm font-semibold">მოდელი<select name="model" required defaultValue="" className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent"><option value="" disabled>აირჩიე</option><option value="A1 mini">A1 mini</option><option value="A1">A1</option><option value="P1P">P1P</option><option value="P1S">P1S</option><option value="X1 Carbon">X1 Carbon</option><option value="H2D">H2D</option><option value="Other Bambu Lab">სხვა Bambu Lab</option></select></label>
          <label className="text-sm font-semibold">Serial-ის ბოლო 4 (არასავალდებულო)<input name="serial_tail" maxLength={12} className="mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent" /></label>
          <button className="mt-auto inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white"><Settings2 size={17} />პრინტერის დამატება</button>
        </form>
      </section>
    </div>
  );
}
