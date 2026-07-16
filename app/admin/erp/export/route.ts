import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const safeDate = (value: string | null, fallback: string) => value && datePattern.test(value) ? value : fallback;

function csvCell(value: unknown) {
  let text = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function csvLine(values: unknown[]) {
  return values.map(csvCell).join(",");
}

export async function GET(request: Request) {
  const profile = await requirePermission("finance.manage");
  if (!profile) return new Response("Forbidden", { status: 403 });
  const admin = createAdminClient() as any;
  if (!admin) return new Response("Supabase is not configured", { status: 503 });

  const url = new URL(request.url);
  const year = new Date().getUTCFullYear();
  const from = safeDate(url.searchParams.get("from"), `${year}-01-01`);
  const to = safeDate(url.searchParams.get("to"), `${year}-12-31`);
  if (from > to) return new Response("Invalid date range", { status: 400 });

  const [purchasesResult, expensesResult, salesResult, usagesResult, journalResult] = await Promise.all([
    admin.from("erp_material_purchases")
      .select("id,document_date,document_type,document_number,quantity_kg,unit_cost_excl_vat,subtotal_gel,vat_gel,total_gel,payment_status,paid_amount_gel,currency,exchange_rate_to_gel,payment_reference,document_reference,notes,erp_suppliers(name,tax_id),material_cost_profiles(code,name)")
      .gte("document_date", from).lte("document_date", to).order("document_date"),
    admin.from("erp_expenses")
      .select("id,expense_date,category,description,document_type,document_number,amount_excl_vat_gel,vat_gel,total_gel,recognized_expense_gel,payment_status,paid_amount_gel,currency,exchange_rate_to_gel,payment_reference,document_reference,notes,erp_suppliers(name,tax_id)")
      .gte("expense_date", from).lte("expense_date", to).order("expense_date"),
    admin.from("erp_sales_events")
      .select("id,event_date,event_type,order_id,provider,provider_payment_id,currency,gross_amount_gel,product_revenue_gel,delivery_revenue_gel,output_vat_gel,vat_rate,reconciliation_status,order_total_snapshot,is_test")
      .eq("is_test", false).gte("event_date", from).lte("event_date", to).order("event_date"),
    admin.from("erp_production_usages")
      .select("id,usage_date,print_job_id,usable_grams,waste_grams,total_grams,usable_material_cost_gel,waste_material_cost_gel,total_material_cost_gel,notes,material_cost_profiles(code,name),order_items(order_id,product_name,sku)")
      .gte("usage_date", from).lte("usage_date", to).order("usage_date"),
    admin.from("erp_journal_entries")
      .select("id,entry_number,entry_date,source_type,source_id,document_number,description,status,is_test,erp_journal_lines(account_code,debit,credit,memo,erp_accounts(name_ka))")
      .eq("is_test", false).gte("entry_date", from).lte("entry_date", to).order("entry_date").order("entry_number"),
  ]);

  const failed = [purchasesResult, expensesResult, salesResult, usagesResult, journalResult].find((result) => result.error);
  if (failed?.error) return new Response("ERP export failed", { status: 500 });

  const columns = [
    "record_type", "date", "document_type", "document_number", "counterparty", "counterparty_tax_id",
    "description", "material", "quantity_kg", "usable_grams", "waste_grams", "currency", "exchange_rate_to_gel",
    "amount_excl_vat_gel", "vat_gel", "total_gel", "paid_amount_gel", "payment_status", "payment_reference",
    "order_id", "payment_provider", "provider_payment_id", "reconciliation_status", "account_code", "account_name",
    "debit_gel", "credit_gel", "source_id", "document_reference", "notes",
  ];
  const lines = [csvLine(columns)];

  for (const row of purchasesResult.data ?? []) {
    lines.push(csvLine([
      "material_purchase", row.document_date, row.document_type, row.document_number, row.erp_suppliers?.name,
      row.erp_suppliers?.tax_id, "მასალის შესყიდვა", row.material_cost_profiles?.code, row.quantity_kg, "", "",
      row.currency, row.exchange_rate_to_gel, row.subtotal_gel, row.vat_gel, row.total_gel, row.paid_amount_gel,
      row.payment_status, row.payment_reference, "", "", "", "", "", "", "", "", row.id, row.document_reference, row.notes,
    ]));
  }
  for (const row of expensesResult.data ?? []) {
    lines.push(csvLine([
      "expense", row.expense_date, row.document_type, row.document_number, row.erp_suppliers?.name,
      row.erp_suppliers?.tax_id, `${row.category}: ${row.description}`, "", "", "", "", row.currency,
      row.exchange_rate_to_gel, row.amount_excl_vat_gel, row.vat_gel, row.total_gel, row.paid_amount_gel,
      row.payment_status, row.payment_reference, "", "", "", "", "", "", "", "", row.id, row.document_reference, row.notes,
    ]));
  }
  for (const row of salesResult.data ?? []) {
    lines.push(csvLine([
      row.event_type === "refund" ? "sales_refund" : "verified_sale", row.event_date, "verified_bank_payment",
      row.provider_payment_id, "ონლაინ მომხმარებელი", "", row.event_type, "", "", "", "", row.currency, 1,
      Number(row.product_revenue_gel) + Number(row.delivery_revenue_gel), row.output_vat_gel, row.gross_amount_gel,
      row.gross_amount_gel, row.event_type === "refund" ? "refunded" : "paid", row.provider_payment_id,
      row.order_id, row.provider, row.provider_payment_id, row.reconciliation_status, "", "", "", "", row.id, "", "",
    ]));
  }
  for (const row of usagesResult.data ?? []) {
    lines.push(csvLine([
      "production_usage", row.usage_date, "production_record", row.print_job_id, "", "",
      `${row.order_items?.product_name ?? "პროდუქტი"} · ${row.order_items?.sku ?? ""}`, row.material_cost_profiles?.code,
      "", row.usable_grams, row.waste_grams, "GEL", 1, row.total_material_cost_gel, 0, row.total_material_cost_gel,
      "", "", "", row.order_items?.order_id, "", "", "", "", "", "", "", row.id, "", row.notes,
    ]));
  }
  for (const entry of journalResult.data ?? []) {
    for (const line of entry.erp_journal_lines ?? []) {
      lines.push(csvLine([
        "journal_line", entry.entry_date, entry.source_type, entry.document_number, "", "", entry.description,
        "", "", "", "", "GEL", 1, "", "", "", "", entry.status, "", "", "", "", "",
        line.account_code, line.erp_accounts?.name_ka, line.debit, line.credit, entry.source_id ?? entry.id, "", line.memo,
      ]));
    }
  }

  const filename = `hooma-accountant-${from}-${to}.csv`;
  return new Response(`\uFEFF${lines.join("\r\n")}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
