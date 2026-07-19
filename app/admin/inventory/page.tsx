import { randomUUID } from "node:crypto";
import { AlertTriangle, Boxes, ClipboardCheck, MapPinned, PackagePlus, Scale, WalletCards } from "lucide-react";
import { redirect } from "next/navigation";
import { receiveMaterialStockAction } from "./actions";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { requirePermission } from "@/lib/supabase/server";

type MaterialProfile = { id: string; code: string; name: string };
type StockRow = {
  material_profile_id: string;
  code: string;
  name: string;
  remaining_grams: number | string;
  stock_value_gel: number | string;
};
type ReceiptRow = {
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

const number = new Intl.NumberFormat("ka-GE", { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat("ka-GE", { style: "currency", currency: "GEL", maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat("ka-GE", { dateStyle: "medium" });
const fieldClass = "mt-2 w-full rounded-xl border border-hooma-text/10 bg-white px-3 py-2.5 font-normal outline-none focus:border-hooma-accent";
const today = () => new Date().toISOString().slice(0, 10);
const numeric = (value: number | string | null | undefined) => Number(value ?? 0);

export default async function AdminInventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const profile = await requirePermission("inventory.manage");
  if (isSupabaseConfigured() && !profile) redirect("/login?next=/admin/inventory");
  const admin = createAdminClient() as any;

  const results = admin ? await Promise.all([
    admin.from("material_cost_profiles").select("id,code,name").eq("is_active", true).order("code"),
    admin.from("erp_material_stock_summary").select("*").order("code"),
    admin.from("erp_material_purchases")
      .select("id,document_date,document_number,quantity_kg,total_gel,payment_status,received_at,warehouse_location,finance_review_status,erp_suppliers(name),material_cost_profiles(code,name)")
      .not("received_at", "is", null)
      .order("received_at", { ascending: false })
      .limit(40),
  ]) : [];

  const setupMissing = !admin || results.some((result: any) => Boolean(result?.error));
  const materials = (results[0]?.data ?? []) as MaterialProfile[];
  const stock = (results[1]?.data ?? []) as StockRow[];
  const receipts = (results[2]?.data ?? []) as ReceiptRow[];
  const totalKg = stock.reduce((sum, row) => sum + numeric(row.remaining_grams) / 1000, 0);
  const stockValue = stock.reduce((sum, row) => sum + numeric(row.stock_value_gel), 0);
  const pendingFinance = receipts.filter((receipt) => receipt.finance_review_status === "pending").length;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-hooma-muted">Operator stock control</p>
          <h1 className="mt-3 text-4xl font-medium">მარაგების მიღება და კონტროლი</h1>
          <p className="mt-3 max-w-4xl text-sm leading-6 text-hooma-muted">ოპერატორი აფიქსირებს ფიზიკურად მიღებულ მასალას, საწყობის ადგილს და პირველადი დოკუმენტის მონაცემებს. შენახვისას იქმნება FIFO ლოტი, იზრდება ხელმისაწვდომი მარაგი და ჩანაწერი ავტომატურად გადადის ERP-ში ფინანსური გადამოწმებისთვის.</p>
        </div>
      </div>

      {params.notice ? <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{params.notice}</p> : null}
      {params.error ? <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{params.error}</p> : null}
      {setupMissing ? <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><strong>ოპერატორის მარაგის მოდული ჯერ არ არის გააქტიურებული.</strong><p className="mt-2">Supabase-ზე გაუშვი <code>20260719000300_operator_inventory_receipts.sql</code>.</p></div> : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.5rem] bg-white/80 p-5 shadow-soft"><Scale size={20} className="text-hooma-accent" /><p className="mt-6 text-sm text-hooma-muted">ფიზიკური მარაგი</p><p className="mt-2 text-2xl font-semibold">{number.format(totalKg)} კგ</p></div>
        <div className="rounded-[1.5rem] bg-white/80 p-5 shadow-soft"><WalletCards size={20} className="text-hooma-accent" /><p className="mt-6 text-sm text-hooma-muted">მარაგის ღირებულება</p><p className="mt-2 text-2xl font-semibold">{money.format(stockValue)}</p></div>
        <div className={`rounded-[1.5rem] p-5 shadow-soft ${pendingFinance ? "bg-amber-50" : "bg-emerald-50"}`}><ClipboardCheck size={20} className={pendingFinance ? "text-amber-700" : "text-emerald-700"} /><p className="mt-6 text-sm opacity-70">ფინანსური გადამოწმება</p><p className="mt-2 text-2xl font-semibold">{pendingFinance} მოლოდინში</p></div>
      </div>

      <section className="grid gap-6 2xl:grid-cols-[minmax(0,1.05fr)_minmax(420px,.95fr)]">
        <div className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm lg:p-6">
          <div className="flex items-start gap-3"><PackagePlus className="mt-0.5 text-hooma-accent" /><div><h2 className="text-2xl font-semibold">მიღებული მასალის დაფიქსირება</h2><p className="mt-2 text-sm leading-6 text-hooma-muted">ერთ ხაზში შეიტანე ერთი მასალა. თუ ერთ დოკუმენტში რამდენიმე მასალაა, თითოეული ცალკე შეინახე იგივე დოკუმენტის ნომრით.</p></div></div>
          <form action={receiveMaterialStockAction} className="mt-6 grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="operation_key" value={randomUUID()} />
            <label className="text-sm font-semibold">მასალა<select name="material_profile_id" required defaultValue="" className={fieldClass}><option value="" disabled>აირჩიე მასალა</option>{materials.map((material) => <option key={material.id} value={material.id}>{material.code} · {material.name}</option>)}</select></label>
            <label className="text-sm font-semibold">საწყობის ზონა / თარო<input name="warehouse_location" required placeholder="მაგ. A-01 · PLA თარო" className={fieldClass} /></label>
            <label className="text-sm font-semibold">მომწოდებელი<input name="supplier_name" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">მომწოდებლის ს/კ<input name="supplier_tax_id" className={fieldClass} /></label>
            <label className="text-sm font-semibold">დოკუმენტის ტიპი<select name="document_type" defaultValue="tax_source_document" className={fieldClass}><option value="tax_source_document">პირველადი საგადასახადო დოკუმენტი</option><option value="tax_invoice">დღგ-ის ანგარიშ-ფაქტურა</option><option value="tax_document">საგადასახადო დოკუმენტი</option><option value="receipt">ქვითარი</option><option value="import_document">იმპორტის დოკუმენტი</option><option value="other">სხვა</option></select></label>
            <label className="text-sm font-semibold">დოკუმენტის ნომერი<input name="document_number" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">დოკუმენტის თარიღი<input name="document_date" type="date" required defaultValue={today()} className={fieldClass} /></label>
            <label className="text-sm font-semibold">ფიზიკურად მიღების თარიღი<input name="received_date" type="date" required defaultValue={today()} className={fieldClass} /></label>
            <label className="text-sm font-semibold">მიღებული რაოდენობა (კგ)<input name="quantity_kg" type="number" min="0.001" step="0.001" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">ფასი დღგ-ის გარეშე / კგ<input name="unit_cost_excl_vat" type="number" min="0.0001" step="0.0001" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">დღგ დოკუმენტიდან<input name="vat_source" type="number" min="0" step="0.01" defaultValue="0" className={fieldClass} /></label>
            <label className="text-sm font-semibold">უკვე გადახდილი თანხა<input name="paid_amount_source" type="number" min="0" step="0.01" defaultValue="0" className={fieldClass} /></label>
            <label className="text-sm font-semibold">ვალუტა<input name="currency" maxLength={3} defaultValue="GEL" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">კურსი GEL-ში<input name="exchange_rate_to_gel" type="number" min="0.000001" step="0.000001" defaultValue="1" required className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდის მეთოდი<input name="payment_method" placeholder="ბანკი / ნაღდი / გადასახდელი" className={fieldClass} /></label>
            <label className="text-sm font-semibold">გადახდის რეფერენსი<input name="payment_reference" className={fieldClass} /></label>
            <label className="text-sm font-semibold sm:col-span-2">დოკუმენტის ბმული / საცავის რეფერენსი<input name="document_reference" placeholder="Drive, RS ან შიდა დოკუმენტის ბმული" className={fieldClass} /></label>
            <label className="text-sm font-semibold sm:col-span-2">ოპერატორის შენიშვნა<textarea name="notes" rows={3} placeholder="შეფუთვის მდგომარეობა, პარტია, ფერი ან სხვა ფაქტობრივი შენიშვნა" className={fieldClass} /></label>
            <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm leading-6 text-blue-950"><strong>შენახვის შედეგი:</strong> მარაგი დაუყოვნებლივ აისახება საწყობში და ERP ჟურნალში; წარმოების ოპერატორის ჩანაწერი ფინანსების გვერდზე დარჩება „გადასამოწმებელი“ სტატუსით.</div>
            <button disabled={setupMissing || !materials.length} className="min-h-12 rounded-full bg-hooma-text px-6 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40 sm:col-span-2 sm:w-fit">მიღება, დასაწყობება და ERP-ში გადატანა</button>
          </form>
        </div>

        <div className="space-y-5">
          <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-3"><Boxes className="text-hooma-accent" /><h2 className="text-xl font-semibold">მასალების მიმდინარე ნაშთი</h2></div>
            <div className="mt-5 space-y-3">
              {stock.map((row) => <div key={row.material_profile_id} className="flex items-center justify-between gap-4 rounded-2xl bg-hooma-background p-4"><div><p className="font-semibold">{row.code} · {row.name}</p><p className="mt-1 text-xs text-hooma-muted">FIFO ლოტების ჯამური ნაშთი</p></div><div className="text-right"><p className="font-semibold">{number.format(numeric(row.remaining_grams) / 1000)} კგ</p><p className="mt-1 text-xs text-hooma-muted">{money.format(numeric(row.stock_value_gel))}</p></div></div>)}
              {!stock.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 p-8 text-center text-sm text-hooma-muted">მიღებული მასალა ჯერ არ არის.</p> : null}
            </div>
          </section>

          <section className="rounded-[1.75rem] border border-hooma-text/10 bg-white/80 p-5 shadow-sm">
            <div className="flex items-center gap-3"><MapPinned className="text-hooma-accent" /><h2 className="text-xl font-semibold">ბოლო მიღებები</h2></div>
            <div className="mt-5 max-h-[680px] space-y-3 overflow-y-auto pr-1">
              {receipts.map((receipt) => <article key={receipt.id} className="rounded-2xl border border-hooma-text/10 bg-white p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold">{receipt.material_cost_profiles?.code || "მასალა"} · {number.format(numeric(receipt.quantity_kg))} კგ</p><p className="mt-1 text-xs text-hooma-muted">{receipt.erp_suppliers?.name || "—"} · {receipt.document_number}</p></div><span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${receipt.finance_review_status === "approved" ? "bg-emerald-100 text-emerald-900" : "bg-amber-100 text-amber-900"}`}>{receipt.finance_review_status === "approved" ? "ფინანსურად შემოწმებული" : "ფინანსების შემოწმება"}</span></div><div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-hooma-muted"><span>{receipt.received_at ? date.format(new Date(receipt.received_at)) : date.format(new Date(receipt.document_date))}</span><span>{receipt.warehouse_location || "ზონა არ არის"}</span><span>{money.format(numeric(receipt.total_gel))}</span><span>{receipt.payment_status}</span></div></article>)}
              {!receipts.length ? <p className="rounded-2xl border border-dashed border-hooma-text/15 p-8 text-center text-sm text-hooma-muted">მიღების ისტორია ჯერ ცარიელია.</p> : null}
            </div>
          </section>
        </div>
      </section>

      <section className="rounded-[1.5rem] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><div className="flex items-start gap-3"><AlertTriangle size={20} className="mt-0.5 shrink-0" /><p className="leading-6"><strong className="block">ფიზიკური და ფინანსური პასუხისმგებლობა გამიჯნულია</strong>ოპერატორი ადასტურებს მიღებულ რაოდენობას, მასალას და დასაწყობების ადგილს. დოკუმენტის საგადასახადო სისწორეს, დღგ-სა და გადახდის სტატუსს საბოლოოდ ამოწმებს Owner/Admin ERP გვერდიდან.</p></div></section>
    </div>
  );
}
