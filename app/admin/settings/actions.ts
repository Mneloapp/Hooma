"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const numberInRange = (formData: FormData, key: string, min: number, max: number) => {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} is outside the allowed range`);
  return value;
};

export async function saveMaterialCostAction(formData: FormData) {
  const profile = await requirePermission("pricing.manage");
  const admin = createAdminClient() as any;
  const id = String(formData.get("id") ?? "");
  if (!profile || !admin || !uuidPattern.test(id)) return;

  try {
    const values = {
      cost_per_kg: numberInRange(formData, "cost_per_kg", 0, 100_000),
      waste_percent: numberInRange(formData, "waste_percent", 0, 100),
    };
    const { error } = await admin.from("material_cost_profiles").update(values).eq("id", id);
    if (!error) await admin.from("audit_log").insert({ actor_id: profile.id, action: "material_cost_updated", entity_type: "material_cost_profile", entity_id: id, metadata: values });
  } catch { return; }
  revalidatePath("/admin/settings");
}

export async function savePricingProfileAction(formData: FormData) {
  const profile = await requirePermission("pricing.manage");
  const admin = createAdminClient() as any;
  const id = String(formData.get("id") ?? "");
  if (!profile || !admin || !uuidPattern.test(id)) return;

  try {
    const values = {
      machine_hour_cost: numberInRange(formData, "machine_hour_cost", 0, 100_000),
      labor_cost_per_order: numberInRange(formData, "labor_cost_per_order", 0, 100_000),
      packaging_cost: numberInRange(formData, "packaging_cost", 0, 100_000),
      overhead_percent: numberInRange(formData, "overhead_percent", 0, 100),
      failure_reserve_percent: numberInRange(formData, "failure_reserve_percent", 0, 100),
      default_margin_percent: numberInRange(formData, "default_margin_percent", 0, 99.99),
      vat_percent: numberInRange(formData, "vat_percent", 0, 100),
      rounding_step: numberInRange(formData, "rounding_step", 0.01, 1_000),
    };
    const { error } = await admin.from("pricing_profiles").update(values).eq("id", id);
    if (!error) await admin.from("audit_log").insert({ actor_id: profile.id, action: "pricing_profile_updated", entity_type: "pricing_profile", entity_id: id, metadata: values });
  } catch { return; }
  revalidatePath("/admin/settings");
}
