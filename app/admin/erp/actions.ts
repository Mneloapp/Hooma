"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const textField = (formData: FormData, name: string, max = 500) => String(formData.get(name) ?? "").trim().slice(0, max);

function numberField(formData: FormData, name: string, min: number, max: number, fallback?: number) {
  const raw = textField(formData, name, 80);
  if (!raw && fallback !== undefined) return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`INVALID_${name.toUpperCase()}`);
  return value;
}

function dateField(formData: FormData, name: string) {
  const value = textField(formData, name, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(new Date(`${value}T00:00:00Z`).valueOf())) {
    throw new Error(`INVALID_${name.toUpperCase()}`);
  }
  return value;
}

function erpRedirect(kind: "notice" | "error", message: string): never {
  redirect(`/admin/erp?${kind}=${encodeURIComponent(message)}`);
}

async function erpContext() {
  const profile = await requirePermission("finance.manage");
  if (!profile) redirect("/login?next=/admin/erp");
  const admin = createAdminClient() as any;
  if (!admin) erpRedirect("error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");
  return { profile, admin };
}

function refreshErp() {
  revalidatePath("/admin/erp");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/settings");
}

function erpErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? error ?? "");
  if (message.includes("ERP_PERIOD_CLOSED")) return "არჩეული სააღრიცხვო პერიოდი დახურულია.";
  if (message.includes("ERP_INSUFFICIENT_MATERIAL_STOCK")) return "არჩეული მასალის საკმარისი მარაგი არ არის — ჯერ შეიტანე შესყიდვა.";
  if (message.includes("ERP_USAGE_ALREADY_RECORDED")) return "ამ ბეჭდვის მასალის ხარჯვა უკვე დაფიქსირებულია.";
  if (message.includes("ERP_PRINT_JOB_NOT_FINISHED")) return "მასალის ჩამოწერა მხოლოდ დასრულებულ ან წარუმატებელ ბეჭდვაზე შეიძლება.";
  if (message.includes("ERP_JOURNAL_UNBALANCED")) return "საბუღალტრო გატარება არ დაბალანსდა და ოპერაცია გაუქმდა.";
  if (message.includes("schema cache") || message.includes("Could not find the function")) return "ERP migration ჯერ არ არის გაშვებული Supabase-ზე.";
  return "ოპერაცია ვერ შესრულდა. შეამოწმე მონაცემები და სცადე თავიდან.";
}

export async function saveErpSettingsAction(formData: FormData) {
  const { profile, admin } = await erpContext();
  try {
    const entityType = textField(formData, "entity_type", 40);
    const taxRegime = textField(formData, "tax_regime", 40);
    if (!["llc", "individual_entrepreneur", "other"].includes(entityType)) throw new Error("INVALID_ENTITY_TYPE");
    if (!["standard", "small_business", "micro_business", "fixed", "other"].includes(taxRegime)) throw new Error("INVALID_TAX_REGIME");
    const { error } = await admin.rpc("save_erp_settings", {
      requested_legal_name: textField(formData, "legal_name", 240),
      requested_tax_id: textField(formData, "tax_id", 80),
      requested_entity_type: entityType,
      requested_tax_regime: taxRegime,
      requested_vat_registered: formData.get("vat_registered") === "on",
      requested_vat_rate: numberField(formData, "vat_rate", 0, 100, 18),
      actor_profile_id: profile.id,
    });
    if (error) throw error;
    refreshErp();
    erpRedirect("notice", "კომპანიის სააღრიცხვო პროფილი შენახულია. საბოლოო რეჟიმი ბუღალტერთან გადაამოწმე.");
  } catch (error) {
    erpRedirect("error", erpErrorMessage(error));
  }
}

export async function recordMaterialPurchaseAction(formData: FormData) {
  const { profile, admin } = await erpContext();
  try {
    const materialProfileId = textField(formData, "material_profile_id", 36);
    if (!uuidPattern.test(materialProfileId)) throw new Error("INVALID_MATERIAL");
    const quantityKg = numberField(formData, "quantity_kg", 0.001, 1_000_000);
    const unitCost = numberField(formData, "unit_cost_excl_vat", 0.0001, 1_000_000);
    const vat = numberField(formData, "vat_source", 0, 100_000_000, 0);
    const totalSource = Math.round((quantityKg * unitCost + vat) * 100) / 100;
    const paidSource = numberField(formData, "paid_amount_source", 0, totalSource, totalSource);
    const { error } = await admin.rpc("erp_record_material_purchase", {
      requested_supplier_name: textField(formData, "supplier_name", 240),
      requested_supplier_tax_id: textField(formData, "supplier_tax_id", 80),
      requested_material_profile_id: materialProfileId,
      requested_document_type: textField(formData, "document_type", 40),
      requested_document_number: textField(formData, "document_number", 160),
      requested_document_date: dateField(formData, "document_date"),
      requested_quantity_kg: quantityKg,
      requested_unit_cost_excl_vat: unitCost,
      requested_vat_source: vat,
      requested_currency: textField(formData, "currency", 3).toUpperCase(),
      requested_exchange_rate_to_gel: numberField(formData, "exchange_rate_to_gel", 0.000001, 1_000_000, 1),
      requested_paid_amount_source: paidSource,
      requested_payment_method: textField(formData, "payment_method", 80),
      requested_payment_reference: textField(formData, "payment_reference", 240),
      requested_document_reference: textField(formData, "document_reference", 500),
      requested_notes: textField(formData, "notes", 1000),
      actor_profile_id: profile.id,
    });
    if (error) throw error;
    refreshErp();
    erpRedirect("notice", "მასალის შესყიდვა, FIFO ლოტი, მარაგი და საბუღალტრო გატარება შეიქმნა.");
  } catch (error) {
    erpRedirect("error", erpErrorMessage(error));
  }
}

export async function recordExpenseAction(formData: FormData) {
  const { profile, admin } = await erpContext();
  try {
    const base = numberField(formData, "amount_excl_vat_source", 0, 100_000_000);
    const vat = numberField(formData, "vat_source", 0, 100_000_000, 0);
    const totalSource = Math.round((base + vat) * 100) / 100;
    const paidSource = numberField(formData, "paid_amount_source", 0, totalSource, totalSource);
    const { error } = await admin.rpc("erp_record_expense", {
      requested_supplier_name: textField(formData, "supplier_name", 240),
      requested_supplier_tax_id: textField(formData, "supplier_tax_id", 80),
      requested_expense_date: dateField(formData, "expense_date"),
      requested_category: textField(formData, "category", 40),
      requested_description: textField(formData, "description", 500),
      requested_document_type: textField(formData, "document_type", 40),
      requested_document_number: textField(formData, "document_number", 160),
      requested_amount_excl_vat_source: base,
      requested_vat_source: vat,
      requested_currency: textField(formData, "currency", 3).toUpperCase(),
      requested_exchange_rate_to_gel: numberField(formData, "exchange_rate_to_gel", 0.000001, 1_000_000, 1),
      requested_paid_amount_source: paidSource,
      requested_payment_method: textField(formData, "payment_method", 80),
      requested_payment_reference: textField(formData, "payment_reference", 240),
      requested_document_reference: textField(formData, "document_reference", 500),
      requested_notes: textField(formData, "notes", 1000),
      actor_profile_id: profile.id,
    });
    if (error) throw error;
    refreshErp();
    erpRedirect("notice", "ხარჯი და დაბალანსებული საბუღალტრო გატარება შენახულია.");
  } catch (error) {
    erpRedirect("error", erpErrorMessage(error));
  }
}

export async function recordProductionUsageAction(formData: FormData) {
  const { profile, admin } = await erpContext();
  try {
    const printJobId = textField(formData, "print_job_id", 36);
    const materialProfileId = textField(formData, "material_profile_id", 36);
    if (!uuidPattern.test(printJobId) || !uuidPattern.test(materialProfileId)) throw new Error("INVALID_USAGE_REFERENCE");
    const { error } = await admin.rpc("erp_record_production_usage", {
      requested_print_job_id: printJobId,
      requested_material_profile_id: materialProfileId,
      requested_usable_grams: numberField(formData, "usable_grams", 0, 1_000_000, 0),
      requested_waste_grams: numberField(formData, "waste_grams", 0, 1_000_000, 0),
      requested_usage_date: dateField(formData, "usage_date"),
      requested_notes: textField(formData, "notes", 1000),
      actor_profile_id: profile.id,
    });
    if (error) throw error;
    refreshErp();
    erpRedirect("notice", "მასალა FIFO პრინციპით ჩამოიწერა და პროდუქტის რეალური თვითღირებულება დაფიქსირდა.");
  } catch (error) {
    erpRedirect("error", erpErrorMessage(error));
  }
}

export async function syncVerifiedPaymentsAction() {
  const { profile, admin } = await erpContext();
  try {
    const { data, error } = await admin.rpc("erp_sync_verified_payments", { actor_profile_id: profile.id });
    if (error) throw error;
    refreshErp();
    erpRedirect("notice", `${Number(data ?? 0)} დადასტურებული საბანკო გადახდა შემოწმდა. სატესტო გადახდები გამოტოვებულია.`);
  } catch (error) {
    erpRedirect("error", erpErrorMessage(error));
  }
}

export async function approveMaterialReceiptAction(formData: FormData) {
  const { profile, admin } = await erpContext();
  try {
    const purchaseId = textField(formData, "purchase_id", 36);
    if (!uuidPattern.test(purchaseId)) throw new Error("INVALID_RECEIPT_REFERENCE");
    const { error } = await admin.rpc("erp_approve_material_receipt", {
      requested_purchase_id: purchaseId,
      actor_profile_id: profile.id,
    });
    if (error) throw error;
    refreshErp();
    erpRedirect("notice", "ოპერატორის მიღება ფინანსურად გადამოწმებულად მოინიშნა. აუდიტის ისტორია შენახულია.");
  } catch (error) {
    erpRedirect("error", erpErrorMessage(error));
  }
}
