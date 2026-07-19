"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { uuidPattern } from "@/lib/production/manual-workflow";

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

function inventoryRedirect(kind: "notice" | "error", message: string): never {
  redirect(`/admin/inventory?${kind}=${encodeURIComponent(message)}`);
}

function receiptError(error: unknown) {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown } | null)?.message ?? error ?? "");
  if (message.includes("ERP_PERIOD_CLOSED")) return "არჩეული დოკუმენტის სააღრიცხვო პერიოდი დახურულია.";
  if (message.includes("ERP_WAREHOUSE_LOCATION_REQUIRED")) return "მიუთითე საწყობის ზონა ან თარო.";
  if (message.includes("ERP_DOCUMENT_NUMBER_REQUIRED")) return "მიუთითე მიღების ან შესყიდვის დოკუმენტის ნომერი.";
  if (message.includes("ERP_MATERIAL_NOT_FOUND")) return "არჩეული მასალა აქტიურ ფასის პროფილებში ვერ მოიძებნა.";
  if (message.includes("ERP_INVALID_PURCHASE_AMOUNT") || message.includes("ERP_INVALID_PAID_AMOUNT")) return "შეამოწმე რაოდენობა, ფასი, დღგ და გადახდილი თანხა.";
  if (message.includes("ERP_FORBIDDEN")) return "მარაგის მიღებისთვის ოპერატორის უფლებაა საჭირო.";
  if (message.includes("schema cache") || message.includes("Could not find the function")) return "ოპერატორის მარაგის migration ჯერ არ არის გაშვებული Supabase-ზე.";
  return "მარაგის მიღება ვერ დაფიქსირდა. შეამოწმე მონაცემები და სცადე თავიდან.";
}

export async function receiveMaterialStockAction(formData: FormData) {
  const profile = await requirePermission("inventory.manage");
  if (!profile) redirect("/login?next=/admin/inventory");
  const admin = createAdminClient() as any;
  if (!admin) inventoryRedirect("error", "Supabase-ის server კავშირი ჯერ არ არის გამართული.");

  try {
    const materialProfileId = textField(formData, "material_profile_id", 36);
    const operationKey = textField(formData, "operation_key", 36);
    if (!uuidPattern.test(materialProfileId) || !uuidPattern.test(operationKey)) throw new Error("INVALID_RECEIPT_REFERENCE");

    const documentDate = dateField(formData, "document_date");
    const receivedDate = dateField(formData, "received_date");
    const quantityKg = numberField(formData, "quantity_kg", 0.001, 1_000_000);
    const unitCost = numberField(formData, "unit_cost_excl_vat", 0.0001, 1_000_000);
    const vat = numberField(formData, "vat_source", 0, 100_000_000, 0);
    const totalSource = Math.round((quantityKg * unitCost + vat) * 100) / 100;
    const paidSource = numberField(formData, "paid_amount_source", 0, totalSource, 0);

    const { error } = await admin.rpc("erp_receive_material_stock_v2", {
      requested_supplier_name: textField(formData, "supplier_name", 240),
      requested_supplier_tax_id: textField(formData, "supplier_tax_id", 80),
      requested_material_profile_id: materialProfileId,
      requested_document_type: textField(formData, "document_type", 40),
      requested_document_number: textField(formData, "document_number", 160),
      requested_document_date: documentDate,
      requested_received_at: `${receivedDate}T12:00:00+04:00`,
      requested_warehouse_location: textField(formData, "warehouse_location", 160),
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
      operation_key: operationKey,
    });
    if (error) throw error;

    revalidatePath("/admin/inventory");
    revalidatePath("/admin/erp");
    revalidatePath("/admin/settings");
    inventoryRedirect("notice", "მასალა მიღებულია: შეიქმნა FIFO ლოტი, განახლდა მარაგი და ჩანაწერი ERP/ფინანსურ კონტროლში გადავიდა.");
  } catch (error) {
    inventoryRedirect("error", receiptError(error));
  }
}
