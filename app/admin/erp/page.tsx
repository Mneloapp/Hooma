import { AlertTriangle, Boxes, Calculator, Download, FileCheck2, Landmark, PackagePlus, ReceiptText, RefreshCw, Scale, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePermission } from "@/lib/supabase/server";
import {
  approveMaterialReceiptAction,
  recordExpenseAction,
  recordMaterialPurchaseAction,
  recordProductionUsageAction,
  saveErpSettingsAction,
  syncVerifiedPaymentsAction,
} from "./actions";

type SettingsRow = {
  legal_name: string | null;
  tax_id: string | null;
  entity_type: string;
  tax_regime: string;
  vat_registered: boolean;
  vat_rate: number | string;
  accounting_standard: string;
};

type MaterialProfile = { id: string; code: string; name: string };
type StockRow = Omit<MaterialProfile, "id"> & { material_profile_id: string; remaining_grams: number | string; stock_value_gel: number | string };
type PurchaseRow = {
  id: string;
  document_date: string;
  document_number: string;
  quantity_kg: number | string;
  total_gel: number | string;
  payment_status: string;
  received_at: string | null;
  warehouse_location: string | null;
  finance_review_status: string;
  erp_suppliers: { name: string } | null;
  material_cost_profiles: { code: string; name: string } | null;
};
type ExpenseRow = {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  total_gel: number | string;
  recognized_expense_gel: number | string;
  payment_status: string;
  erp_suppliers: { name: string } | null;
};
type SalesRow = {
  id: string;
  event_date: string;
  event_type: string;
  order_id: string;
  provider: string;
  provider_payment_id: string | null;
  gross_amount_gel: number | string;
  product_revenue_gel: number | string;
  delivery_revenue_gel: number | string;
  output_vat_gel: number | string;
  reconciliation_status: string;
};
type PnlRow = {
  month: string;
  revenue_gel: number | string;
  material_cogs_gel: number | string;
  production_waste_gel: number | string;
  operating_expense_gel: number | string;
  management_profit_gel: number | string;
  output_vat_gel: number | string;
  input_vat_gel: number | string;
  estimated_vat_payable_gel: number | string;
};
type JobRow = {
  id: string;
  status: string;
  completed_at: string | null;
  product_name_snapshot: string | null;
  sku_snapshot: string | null;
  material: string | null;
  order_items: { order_id: string; product_name: string | null; sku: string | null } | null;
};

const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 3 });
const dateFormat = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium" });
const fieldClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent";
const categoryLabels: Record<string, string> = {
  utilities: "კომუნალური", rent: "ქირა", salary: "ხელფასი", delivery: "მიწოდება", packaging: "შეფუთვა",
  maintenance: "მომსახურება", software: "პროგრამები", marketing: "მარკეტინგი", bank_fee: "ბანკის საკომისიო", tax: "გადასახადი", other: "სხვა",
};
const entityLabels: Record<string, string> = { llc: "შპს", individual_entrepreneur: "ინდივიდუალური მეწარმე", other: "სხვა" };
const taxRegimeLabels: Record<string, string> = { standard: "სტანდარტული", small_business: "მცირე ბიზნესი", micro_business: "მიკრო ბიზნესი", fixed: "ფიქსირებული", other: "სხვა" };

const numeric = (value: number | string | null | undefined) => Number(value ?? 0);
const dateValue = () => new Date().toISOString().slice(0, 10);

export default async function ErpPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const params = await searchParams;
  const profile = await requirePermission("finance.manage");
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/admin/erp");
  const admin = createAdminClient() as any;

  const results = admin ? await Promise.all([
    admin.from("erp_settings").select("*").eq("id", 1).maybeSingle(),
    admin.from("material_cost_profiles").select("id,code,name").eq("is_active", true).order("code"),
    admin.from("erp_material_stock_summary").select("*").order("code"),
    admin.from("erp_material_purchases").select("id,document_date,document_number,quantity_kg,total_gel,payment_status,received_at,warehouse_location,finance_review_status,erp_suppliers(name),material_cost_profiles(code,name)").order("document_date", { ascending: false }).limit(40),
    admin.from("erp_expenses").select("id,expense_date,category,description,total_gel,recognized_expense_gel,payment_status,erp_suppliers(name)").order("expense_date", { ascending: false }).limit(20),
    admin.from("erp_sales_events").select("id,event_date,event_type,order_id,provider,provider_payment_id,gross_amount_gel,product_revenue_gel,delivery_revenue_gel,output_vat_gel,reconciliation_status").eq("is_test", false).order("event_date", { ascending: false }).limit(30),
    admin.from("erp_profit_loss_monthly").select("*").order("month", { ascending: false }).limit(24),
    admin.from("erp_production_usages").select("print_job_id").limit(5000),
    admin.from("print_jobs").select("id,status,completed_at,product_name_snapshot,sku_snapshot,material,order_items(order_id,product_name,sku)").in("status", ["completed", "quality_check", "approved", "failed"]).order("completed_at", { ascending: false }).limit(200),
    admin.from("erp_sync_issues").select("id,error_code,details,last_seen_at").eq("status", "open").order("last_seen_at", { ascending: false }).limit(20),
  ]) : [];

  const setupMissing = !admin || results.some((result: any, index) => index < 8 && Boolean(result?.error));
  const settings = (results[0]?.data ?? null) as SettingsRow | null;
  const materials = (results[1]?.data ?? []) as MaterialProfile[];
  const stock = (results[2]?.data ?? []) as StockRow[];
  const purchases = (results[3]?.data ?? []) as PurchaseRow[];
  const expenses = (results[4]?.data ?? []) as ExpenseRow[];
  const sales = (results[5]?.data ?? []) as SalesRow[];
  const pnl = (results[6]?.data ?? []) as PnlRow[];
  const usageJobIds = new Set<string>(((results[7]?.data ?? []) as Array<{ print_job_id: string }>).map((row) => row.print_job_id));
  const unrecordedJobs = ((results[8]?.data ?? []) as JobRow[]).filter((job) => !usageJobIds.has(job.id));
  const syncIssues = (results[9]?.data ?? []) as Array<{ id: string; error_code: string; details: Record<string, unknown>; last_seen_at: string }>;

  const stockValue = stock.reduce((sum, row) => sum + numeric(row.stock_value_gel), 0);
  const revenue = pnl.reduce((sum, row) => sum + numeric(row.revenue_gel), 0);
  const cogs = pnl.reduce((sum, row) => sum + numeric(row.material_cogs_gel) + numeric(row.production_waste_gel), 0);
  const operatingExpenses = pnl.reduce((sum, row) => sum + numeric(row.operating_expense_gel), 0);
  const managementProfit = revenue - cogs - operatingExpenses;
  const vatEstimate = pnl.reduce((sum, row) => sum + numeric(row.estimated_vat_payable_gel), 0);
  const companyConfigured = Boolean(settings?.legal_name && settings?.tax_id);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Finance & operations ledger</p>
          <h1 className="mt-3 text-4xl font-medium">ERP და ფინანსები</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">მასალის შესყიდვა კილოგრამებით, FIFO მარაგი, წარმოებაში რეალური ჩამოწერა, დადასტურებული გადახდები, ხარჯები, მოგება/ზარალი და ბუღალტრისთვის ექსპორტი ერთ აუდიტირებად სისტემაში.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href="/admin/erp/export?report=accountant-pack" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white"><Download size={17} />ბუღალტრული CSV პაკეტი</a>
        </div>
      </div>

      {params.notice ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.notice}</p> : null}
      {params.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{params.error}</p> : null}
      {setupMissing ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong>ERP ჯერ არ არის გააქტიურებული.</strong> გაუშვი migration <code>20260716000300_erp_finance_core.sql</code> Supabase-ზე და განაახლე გვერდი.</div> : null}
      {syncIssues.length ? <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-950"><strong>{syncIssues.length} ფინანსური სინქრონიზაცია საჭიროებს შემოწმებას.</strong><p className="mt-2 leading-6 text-red-900/75">საბანკო webhook არ დაბლოკილა; ფინანსური ჩანაწერი exception queue-ში დარჩა. ყველაზე ბოლო მიზეზი: {syncIssues[0].error_code}</p></div> : null}

      <section className="rounded-[1.5rem] border border-blue-200 bg-blue-50 p-5 text-blue-950">
        <div className="flex items-start gap-3"><FileCheck2 size={20} className="mt-0.5 shrink-0" /><div><h2 className="font-semibold">საგადასახადო კონტროლის საზღვარი</h2><p className="mt-2 text-sm leading-6 text-blue-900/80">ERP ინახავს პირველადი დოკუმენტის ნომერს, თარიღს, მხარეს, საქონელს/მომსახურებასა და ღირებულებას, ასევე ქმნის დაბალანსებულ ჟურნალს. აქ ნაჩვენები მოგება და დღგ არის მენეჯერული გაანგარიშება — დეკლარაციას და შემოსავლების სამსახურში საბოლოო გატარებას ამტკიცებს ბუღალტერი. პირდაპირი RS ინტეგრაცია ამ ეტაპზე ჩართული არ არის.</p></div></div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          ["რეალური შემოსავალი", money.format(revenue), Landmark],
          ["მასალის მარაგი", money.format(stockValue), Boxes],
          ["მასალა და დანაკარგი", money.format(cogs), Scale],
          ["საოპერაციო ხარჯი", money.format(operatingExpenses), WalletCards],
          ["მენეჯერული შედეგი", money.format(managementProfit), Calculator],
        ].map(([label, value, Icon]) => {
          const CardIcon = Icon as typeof Landmark;
          return <div key={String(label)} className="rounded-[1.5rem] bg-white/80 p-5 shadow-soft"><CardIcon size={19} className="text-hooma-accent" /><p className="mt-6 text-sm text-hooma-muted">{label as string}</p><p className="mt-2 text-2xl font-semibold">{value as string}</p></div>;
        })}
      </div>

      <section className={`rounded-[1.5rem] border p-5 ${companyConfigured ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start"><div><p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-70">სააღრიცხვო პროფილი</p><h2 className="mt-2 text-2xl font-semibold">{settings?.legal_name || "კომპანია ჯერ არ არის მითითებული"}</h2><p className="mt-2 text-sm opacity-75">{settings?.tax_id ? `საიდენტიფიკაციო კოდი: ${settings.tax_id}` : "შეავსე იურიდიული მონაცემები"}{settings ? ` · ${entityLabels[settings.entity_type] ?? settings.entity_type} · ${taxRegimeLabels[settings.tax_regime] ?? settings.tax_regime}` : ""}</p></div>{settings?.vat_registered ? <div className="rounded-full bg-white/75 px-4 py-2 text-sm font-semibold">დღგ-ის გადამხდელი · {numeric(settings.vat_rate)}%</div> : <div className="rounded-full bg-white/75 px-4 py-2 text-sm font-semibold">დღგ: არ არის რეგისტრირებული</div>}</div>
        <details className="mt-5 rounded-2xl border border-current/10 bg-white/65 p-4"><summary className="cursor-pointer font-semibold">კომპანიის და საგადასახადო რეჟიმის რედაქტირება</summary><form action={saveErpSettingsAction} className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-sm font-semibold">იურიდიული დასახელება<input name="legal_name" required defaultValue={settings?.legal_name ?? ""} className={fieldClass} /></label>
          <label className="text-sm font-semibold">საიდენტიფიკაციო კოდი<input name="tax_id" required defaultValue={settings?.tax_id ?? ""} className={fieldClass} /></label>
          <label className="text-sm font-semibold">პირის ტიპი<select name="entity_type" defaultValue={settings?.entity_type ?? "llc"} className={fieldClass}><option value="llc">შპს</option><option value="individual_entrepreneur">ინდივიდუალური მეწარმე</option><option value="other">სხვა</option></select></label>
          <label className="text-sm font-semibold">საგადასახადო რეჟიმი<select name="tax_regime" defaultValue={settings?.tax_regime ?? "standard"} className={fieldClass}><option value="standard">სტანდარტული</option><option value="small_business">მცირე ბიზნესი</option><option value="micro_business">მიკრო ბიზნესი</option><option value="fixed">ფიქსირებული</option><option value="other">სხვა</option></select></label>
          <label className="text-sm font-semibold">დღგ-ის განაკვეთი (%)<input name="vat_rate" type="number" min="0" max="100" step="0.01" defaultValue={numeric(settings?.vat_rate || 18)} className={fieldClass} /></label>
          <label className="mt-auto flex min-h-11 items-center gap-3 rounded-xl border border-hooma-text/10 bg-white px-4 text-sm font-semibold"><input name="vat_registered" type="checkbox" defaultChecked={settings?.vat_registered ?? false} />დღგ-ის გადამხდელად რეგისტრირებულია</label>
          <button className="min-h-11 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white md:w-fit">პროფილის შენახვა</button>
        </form></details>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <details className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm" open>
          <summary className="flex cursor-pointer list-none items-center gap-3 text-xl font-semibold"><PackagePlus className="text-hooma-accent" />მასალის შესყიდვა და ლოტი</summary>
          <p className="mt-3 text-sm leading-6 text-hooma-muted">ერთ შესყიდვაზე იქმნება ერთი FIFO ლოტი. ერთ დოკუმენტში რამდენიმე მასალის შემთხვევაში თითო მასალა ცალკე ხაზად შეიტანე იგივე დოკუმენტის ნომრით.</p>
          <form action={recordMaterialPurchaseAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">მომწოდებელი<input name="supplier_name" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">მომწოდებლის ს/კ<input name="supplier_tax_id" className={fieldClass} /></label>
            <label className="text-sm font-semibold">მასალა<select name="material_profile_id" required defaultValue="" className={fieldClass}><option value="" disabled>აირჩიე</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label>
            <label className="text-sm font-semibold">დოკუმენტის ტიპი<select name="document_type" defaultValue="tax_source_document" className={fieldClass}><option value="tax_source_document">პირველადი საგადასახადო დოკუმენტი</option><option value="tax_invoice">დღგ-ის ანგარიშ-ფაქტურა</option><option value="tax_document">საგადასახადო დოკუმენტი</option><option value="receipt">ქვითარი</option><option value="import_document">იმპორტის დოკუმენტი</option><option value="other">სხვა</option></select></label>
            <label className="text-sm font-semibold">დოკუმენტის ნომერი<input name="document_number" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">დოკუმენტის თარიღი<input name="document_date" type="date" required defaultValue={dateValue()} className={fieldClass} /></label>
            <label className="text-sm font-semibold">რაოდენობა (კგ)<input name="quantity_kg" type="number" min="0.001" step="0.001" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">ფასი დღგ-ის გარეშე / კგ<input name="unit_cost_excl_vat" type="number" min="0.0001" step="0.0001" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">დღგ დოკუმენტიდან<input name="vat_source" type="number" min="0" step="0.01" defaultValue="0" className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდილი თანხა<input name="paid_amount_source" type="number" min="0" step="0.01" placeholder="ცარიელი = სრულად გადახდილი" className={fieldClass} /></label>
            <label className="text-sm font-semibold">ვალუტა<input name="currency" maxLength={3} defaultValue="GEL" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">კურსი GEL-ში<input name="exchange_rate_to_gel" type="number" min="0.000001" step="0.000001" defaultValue="1" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდის მეთოდი<input name="payment_method" placeholder="ბანკი / ბარათი / ნაღდი" className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდის რეფერენსი<input name="payment_reference" className={fieldClass} /></label>
            <label className="text-sm font-semibold sm:col-span-2">დოკუმენტის ბმული/ფაილის კოდი<input name="document_reference" className={fieldClass} /></label>
            <label className="text-sm font-semibold sm:col-span-2">შენიშვნა<textarea name="notes" rows={2} className={fieldClass} /></label>
            <button className="min-h-11 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white sm:w-fit">შესყიდვის და ლოტის შენახვა</button>
          </form>
        </details>

        <details className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
          <summary className="flex cursor-pointer list-none items-center gap-3 text-xl font-semibold"><ReceiptText className="text-hooma-accent" />სხვა ხარჯის დამატება</summary>
          <p className="mt-3 text-sm leading-6 text-hooma-muted">ქირა, ელექტროენერგია, შეფუთვა, პროგრამები, მარკეტინგი, კურიერი და სხვა საოპერაციო ხარჯები.</p>
          <form action={recordExpenseAction} className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">მომწოდებელი (თუ არის)<input name="supplier_name" className={fieldClass} /></label>
            <label className="text-sm font-semibold">მომწოდებლის ს/კ<input name="supplier_tax_id" className={fieldClass} /></label>
            <label className="text-sm font-semibold">თარიღი<input name="expense_date" type="date" required defaultValue={dateValue()} className={fieldClass} /></label>
            <label className="text-sm font-semibold">კატეგორია<select name="category" defaultValue="other" className={fieldClass}>{Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="text-sm font-semibold sm:col-span-2">აღწერა<input name="description" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">დოკუმენტის ტიპი<select name="document_type" defaultValue="tax_source_document" className={fieldClass}><option value="tax_source_document">პირველადი საგადასახადო დოკუმენტი</option><option value="tax_invoice">დღგ-ის ანგარიშ-ფაქტურა</option><option value="tax_document">საგადასახადო დოკუმენტი</option><option value="receipt">ქვითარი</option><option value="bank_statement">ბანკის ამონაწერი</option><option value="other">სხვა</option></select></label>
            <label className="text-sm font-semibold">დოკუმენტის ნომერი<input name="document_number" className={fieldClass} /></label>
            <label className="text-sm font-semibold">თანხა დღგ-ის გარეშე<input name="amount_excl_vat_source" type="number" min="0" step="0.01" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">დღგ<input name="vat_source" type="number" min="0" step="0.01" defaultValue="0" className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდილი თანხა<input name="paid_amount_source" type="number" min="0" step="0.01" placeholder="ცარიელი = სრულად გადახდილი" className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდის მეთოდი<input name="payment_method" className={fieldClass} /></label>
            <label className="text-sm font-semibold">ვალუტა<input name="currency" maxLength={3} defaultValue="GEL" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">კურსი GEL-ში<input name="exchange_rate_to_gel" type="number" min="0.000001" step="0.000001" defaultValue="1" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდის რეფერენსი<input name="payment_reference" className={fieldClass} /></label>
            <label className="text-sm font-semibold">დოკუმენტის ბმული/კოდი<input name="document_reference" className={fieldClass} /></label>
            <label className="text-sm font-semibold sm:col-span-2">შენიშვნა<textarea name="notes" rows={2} className={fieldClass} /></label>
            <button className="min-h-11 rounded-full bg-hooma-text px-5 text-sm font-semibold text-white sm:w-fit">ხარჯის შენახვა</button>
          </form>
        </details>
      </section>

      <section className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Production costing</p><h2 className="mt-2 text-2xl font-semibold">დასრულებული ბეჭდვების მასალის ჩამოწერა</h2><p className="mt-2 text-sm text-hooma-muted">ოპერატორის დასრულებული სამუშაოდან მიუთითე პროდუქტში დარჩენილი მასალა და ნარჩენი. სისტემა ძველი ლოტიდან დაიწყებს ჩამოწერას.</p></div><span className="rounded-full bg-hooma-panel px-4 py-2 text-sm font-semibold">{unrecordedJobs.length} დასაფიქსირებელი</span></div>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {unrecordedJobs.slice(0, 12).map((job) => (
            <form key={job.id} action={recordProductionUsageAction} className="rounded-2xl border border-hooma-text/10 bg-hooma-background p-4">
              <input type="hidden" name="print_job_id" value={job.id} /><input type="hidden" name="usage_date" value={(job.completed_at ?? dateValue()).slice(0, 10)} />
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-semibold text-hooma-accent">#{job.order_items?.order_id?.slice(0, 8).toUpperCase() ?? "—"} · {job.status}</p><h3 className="mt-1 font-semibold">{job.product_name_snapshot || job.order_items?.product_name || "პროდუქტი"}</h3><p className="mt-1 text-xs text-hooma-muted">{job.sku_snapshot || job.order_items?.sku || "—"} · {job.material || "მასალა უცნობია"}</p></div><span className="text-xs text-hooma-muted">{job.completed_at ? dateFormat.format(new Date(job.completed_at)) : "—"}</span></div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <label className="text-xs font-semibold">მასალის ლოტები<select name="material_profile_id" required defaultValue="" className={fieldClass}><option value="" disabled>აირჩიე</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.code}</option>)}</select></label>
                <label className="text-xs font-semibold">პროდუქტში დარჩა (გრ)<input name="usable_grams" type="number" min="0" step="0.001" defaultValue="0" required className={fieldClass} /></label>
                <label className="text-xs font-semibold">ნარჩენი (გრ)<input name="waste_grams" type="number" min="0" step="0.001" defaultValue="0" required className={fieldClass} /></label>
              </div>
              <label className="mt-3 block text-xs font-semibold">შენიშვნა<input name="notes" className={fieldClass} /></label>
              <button className="mt-4 rounded-full bg-hooma-text px-4 py-2.5 text-xs font-semibold text-white">FIFO ჩამოწერა</button>
            </form>
          ))}
          {!unrecordedJobs.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 p-8 text-center text-sm text-hooma-muted xl:col-span-2">ყველა დასრულებული ბეჭდვის მასალა აღრიცხულია.</p> : null}
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Verified payments only</p><h2 className="mt-2 text-2xl font-semibold">გაყიდვები და დაბრუნებები</h2></div><form action={syncVerifiedPaymentsAction}><button className="inline-flex min-h-10 items-center gap-2 rounded-full border border-hooma-text/10 px-4 text-xs font-semibold"><RefreshCw size={14} />ძველი გადახდების სინქრონიზაცია</button></form></div>
          <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs text-hooma-muted"><tr><th className="pb-3 pr-4">თარიღი</th><th className="pb-3 pr-4">შეკვეთა</th><th className="pb-3 pr-4">ბანკი</th><th className="pb-3 pr-4">თანხა</th><th className="pb-3">შედარება</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id} className="border-t border-hooma-text/10"><td className="py-3 pr-4">{dateFormat.format(new Date(sale.event_date))}</td><td className="py-3 pr-4 font-mono text-xs">#{sale.order_id.slice(0, 8).toUpperCase()}</td><td className="py-3 pr-4 uppercase">{sale.provider}</td><td className={`py-3 pr-4 font-semibold ${numeric(sale.gross_amount_gel) < 0 ? "text-red-700" : ""}`}>{money.format(numeric(sale.gross_amount_gel))}</td><td className="py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${sale.reconciliation_status === "matched" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{sale.reconciliation_status === "matched" ? "ემთხვევა" : "შესამოწმებელია"}</span></td></tr>)}</tbody></table>{!sales.length ? <p className="py-8 text-center text-sm text-hooma-muted">რეალური, ხელმოწერით დადასტურებული საბანკო გადახდა ჯერ არ არის.</p> : null}</div>
        </div>

        <div className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
          <p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Raw material inventory</p><h2 className="mt-2 text-2xl font-semibold">მასალების მარაგი</h2>
          <div className="mt-5 space-y-3">{stock.map((row) => <div key={row.material_profile_id} className="flex items-center justify-between gap-4 rounded-2xl bg-hooma-background p-4"><div><p className="font-semibold">{row.code}</p><p className="mt-1 text-xs text-hooma-muted">{row.name}</p></div><div className="text-right"><p className="font-semibold">{number.format(numeric(row.remaining_grams) / 1000)} კგ</p><p className="mt-1 text-xs text-hooma-muted">{money.format(numeric(row.stock_value_gel))}</p></div></div>)}</div>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div><p className="text-xs uppercase tracking-[0.2em] text-hooma-muted">Management P&L</p><h2 className="mt-2 text-2xl font-semibold">მოგება / ზარალი თვეების მიხედვით</h2></div>{settings?.vat_registered ? <div className="rounded-full bg-hooma-panel px-4 py-2 text-sm font-semibold">დაგროვილი დღგ-ის შეფასება: {money.format(vatEstimate)}</div> : null}</div>
        <div className="mt-5 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead className="text-xs text-hooma-muted"><tr><th className="pb-3 pr-4">თვე</th><th className="pb-3 pr-4">შემოსავალი</th><th className="pb-3 pr-4">მასალა</th><th className="pb-3 pr-4">დანაკარგი</th><th className="pb-3 pr-4">სხვა ხარჯი</th><th className="pb-3 pr-4">შედეგი</th><th className="pb-3">დღგ-ის შეფასება</th></tr></thead><tbody>{pnl.map((row) => <tr key={row.month} className="border-t border-hooma-text/10"><td className="py-3 pr-4 font-semibold">{new Intl.DateTimeFormat("ka-GE", { month: "long", year: "numeric" }).format(new Date(`${row.month}T00:00:00`))}</td><td className="py-3 pr-4">{money.format(numeric(row.revenue_gel))}</td><td className="py-3 pr-4">{money.format(numeric(row.material_cogs_gel))}</td><td className="py-3 pr-4">{money.format(numeric(row.production_waste_gel))}</td><td className="py-3 pr-4">{money.format(numeric(row.operating_expense_gel))}</td><td className={`py-3 pr-4 font-semibold ${numeric(row.management_profit_gel) < 0 ? "text-red-700" : "text-emerald-800"}`}>{money.format(numeric(row.management_profit_gel))}</td><td className="py-3">{money.format(numeric(row.estimated_vat_payable_gel))}</td></tr>)}</tbody></table>{!pnl.length ? <p className="py-8 text-center text-sm text-hooma-muted">ანგარიში ოპერაციების დამატების შემდეგ გამოჩნდება.</p> : null}</div>
      </section>

      <section className="grid gap-5 xl:grid-cols-2">
        <div className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5"><div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold">ბოლო შესყიდვები და მიღებები</h2>{purchases.some((purchase) => purchase.finance_review_status === "pending") ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">ფინანსური შემოწმება საჭიროა</span> : null}</div><div className="mt-4 space-y-3">{purchases.map((purchase) => <div key={purchase.id} className={`flex flex-col justify-between gap-3 rounded-2xl p-4 sm:flex-row sm:items-center ${purchase.finance_review_status === "pending" ? "border border-amber-200 bg-amber-50" : "bg-hooma-background"}`}><div><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{purchase.material_cost_profiles?.code || "მასალა"} · {number.format(numeric(purchase.quantity_kg))} კგ</p>{purchase.received_at ? <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${purchase.finance_review_status === "approved" ? "bg-emerald-100 text-emerald-900" : "bg-amber-200 text-amber-950"}`}>{purchase.finance_review_status === "approved" ? "მიღება შემოწმებულია" : "ოპერატორის მიღება"}</span> : null}</div><p className="mt-1 text-xs text-hooma-muted">{purchase.erp_suppliers?.name || "—"} · {purchase.document_number} · {dateFormat.format(new Date(purchase.document_date))}{purchase.warehouse_location ? ` · ${purchase.warehouse_location}` : ""}</p></div><div className="flex items-center gap-3 sm:text-right"><div><p className="font-semibold">{money.format(numeric(purchase.total_gel))}</p><p className="mt-1 text-xs text-hooma-muted">{purchase.payment_status}</p></div>{purchase.finance_review_status === "pending" ? <form action={approveMaterialReceiptAction}><input type="hidden" name="purchase_id" value={purchase.id} /><button className="min-h-9 rounded-full bg-amber-950 px-3 text-xs font-semibold text-white">გადამოწმებულია</button></form> : null}</div></div>)}</div></div>
        <div className="rounded-[1.5rem] border border-hooma-text/10 bg-white/80 p-5"><h2 className="text-xl font-semibold">ბოლო ხარჯები</h2><div className="mt-4 space-y-3">{expenses.map((expense) => <div key={expense.id} className="flex flex-col justify-between gap-2 rounded-2xl bg-hooma-background p-4 sm:flex-row sm:items-center"><div><p className="font-semibold">{categoryLabels[expense.category] || expense.category} · {expense.description}</p><p className="mt-1 text-xs text-hooma-muted">{expense.erp_suppliers?.name || "—"} · {dateFormat.format(new Date(expense.expense_date))}</p></div><div className="text-right"><p className="font-semibold">{money.format(numeric(expense.total_gel))}</p><p className="mt-1 text-xs text-hooma-muted">{expense.payment_status}</p></div></div>)}</div></div>
      </section>

      <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-amber-950">
        <div className="flex items-start gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0" /><div><h2 className="font-semibold">ბუღალტერთან დასადასტურებელი პარამეტრები</h2><p className="mt-2 text-sm leading-6 text-amber-900/80">კომპანიის ტიპი და რეჟიმი, დღგ-ის სტატუსი, ანგარიშთა გეგმის კოდები, წარმოების დანაკარგის აღიარების წესი, შემოსავლის აღიარების თარიღი და RS-ში ზედნადების/საგადასახადო დოკუმენტის პროცესი. ERP ინახავს საფუძველ მონაცემებს ისე, რომ ამ წესების დაზუსტებისას ისტორიის დაკარგვა არ დაგვჭირდეს.</p></div></div>
      </section>
    </div>
  );
}
