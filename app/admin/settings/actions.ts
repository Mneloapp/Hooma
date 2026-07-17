"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type MaterialCostProfileResult = {
  id: string;
  code: string;
  name: string;
  cost_per_kg: number | string;
  waste_percent: number | string;
  is_active: boolean;
};

export type PricingProfileResult = {
  id: string;
  name: string;
  machine_hour_cost: number | string;
  labor_cost_per_order: number | string;
  packaging_cost: number | string;
  overhead_percent: number | string;
  failure_reserve_percent: number | string;
  default_margin_percent: number | string;
  daily_deal_discount_percent: number | string;
  vat_percent: number | string;
  rounding_step: number | string;
  is_default: boolean;
};

export type SettingsActionResult<T> = { ok: true; message: string; data: T } | { ok: false; message: string };
type RecalculationResult = { recalculated_variant_count?: number | string; affected_product_count?: number | string };
type SavedSettingsPayload<T> = { profile?: T; recalculation?: RecalculationResult };
type SavedDailyDealPayload<T> = { profile?: T; updated_current_deal_count?: number | string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const numberInRange = (formData: FormData, key: string, min: number, max: number) => {
  const rawValue = formData.get(key);
  if (typeof rawValue !== "string" || rawValue.trim() === "") throw new Error(`${key} is required`);
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} is outside the allowed range`);
  return value;
};

export async function saveMaterialCostAction(formData: FormData): Promise<SettingsActionResult<MaterialCostProfileResult>> {
  const profile = await requirePermission("pricing.manage");
  const admin = createAdminClient() as any;
  const id = String(formData.get("id") ?? "");
  if (!profile || !admin) return { ok: false, message: "ამ მოქმედებისთვის Owner ან Admin ანგარიშია საჭირო." };
  if (!uuidPattern.test(id)) return { ok: false, message: "მასალის პროფილი არასწორია." };

  try {
    const values = {
      cost_per_kg: numberInRange(formData, "cost_per_kg", 0, 100_000),
      waste_percent: numberInRange(formData, "waste_percent", 0, 100),
    };
    const { data, error } = await admin.rpc("save_material_cost_profile_v2", {
      requested_profile_id: id,
      requested_cost_per_kg: values.cost_per_kg,
      requested_waste_percent: values.waste_percent,
      actor_profile_id: profile.id,
    });
    if (error) {
      if (error.message?.includes("save_material_cost_profile_v2") || error.message?.includes("schema cache")) {
        return { ok: false, message: "გაუშვი ბოლო Supabase migration და სცადე თავიდან." };
      }
      return { ok: false, message: "მასალის ფასი და პროდუქტების ფასები ვერ განახლდა. სცადე თავიდან." };
    }
    const payload = (Array.isArray(data) ? data[0] : data) as SavedSettingsPayload<MaterialCostProfileResult> | null;
    const saved = payload?.profile ?? null;
    if (!saved?.id) return { ok: false, message: "შენახული მასალის პროფილი ვერ დაბრუნდა." };
    const affectedProducts = Number(payload?.recalculation?.affected_product_count ?? 0);
    revalidatePath("/admin/settings");
    revalidatePath("/admin/imports");
    revalidatePath("/admin/products");
    revalidatePath("/admin/products/new");
    revalidatePath("/admin/products/[id]", "page");
    revalidatePath("/product/[slug]", "page");
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/deals");
    return { ok: true, message: `${saved.name} — ფასი შენახულია; ${affectedProducts} პროდუქტის გასაყიდი ფასი ავტომატურად გადაითვალა.`, data: saved };
  } catch {
    return { ok: false, message: "შეამოწმე ფასი და დანაკარგის პროცენტი." };
  }
}

export async function savePricingProfileAction(formData: FormData): Promise<SettingsActionResult<PricingProfileResult>> {
  const profile = await requirePermission("pricing.manage");
  const admin = createAdminClient() as any;
  const id = String(formData.get("id") ?? "");
  if (!profile || !admin) return { ok: false, message: "ამ მოქმედებისთვის Owner ან Admin ანგარიშია საჭირო." };
  if (!uuidPattern.test(id)) return { ok: false, message: "ფასის პროფილი არასწორია." };

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
    const { data, error } = await admin.rpc("save_default_pricing_profile_v2", {
      requested_profile_id: id,
      requested_machine_hour_cost: values.machine_hour_cost,
      requested_labor_cost_per_order: values.labor_cost_per_order,
      requested_packaging_cost: values.packaging_cost,
      requested_overhead_percent: values.overhead_percent,
      requested_failure_reserve_percent: values.failure_reserve_percent,
      requested_default_margin_percent: values.default_margin_percent,
      requested_vat_percent: values.vat_percent,
      requested_rounding_step: values.rounding_step,
      actor_profile_id: profile.id,
    });
    if (error) {
      if (error.message?.includes("save_default_pricing_profile_v2") || error.message?.includes("schema cache")) {
        return { ok: false, message: "გაუშვი ბოლო Supabase migration და სცადე თავიდან." };
      }
      return { ok: false, message: "წარმოებისა და ფასის პარამეტრები და პროდუქტების ფასები ვერ განახლდა. სცადე თავიდან." };
    }
    const payload = (Array.isArray(data) ? data[0] : data) as SavedSettingsPayload<PricingProfileResult> | null;
    const saved = payload?.profile ?? null;
    if (!saved?.id) return { ok: false, message: "შენახული ფასის პროფილი ვერ დაბრუნდა." };
    const affectedProducts = Number(payload?.recalculation?.affected_product_count ?? 0);
    revalidatePath("/admin/settings");
    revalidatePath("/admin/imports");
    revalidatePath("/admin/products");
    revalidatePath("/admin/products/new");
    revalidatePath("/admin/products/[id]", "page");
    revalidatePath("/product/[slug]", "page");
    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/deals");
    return { ok: true, message: `საერთო პარამეტრები შენახულია; ${affectedProducts} პროდუქტის გასაყიდი ფასი ავტომატურად გადაითვალა.`, data: saved };
  } catch {
    return { ok: false, message: "შეამოწმე წარმოებისა და ფასის ყველა მნიშვნელობა." };
  }
}

export async function saveDailyDealDiscountAction(formData: FormData): Promise<SettingsActionResult<PricingProfileResult>> {
  const profile = await requirePermission("pricing.manage");
  const admin = createAdminClient() as any;
  const id = String(formData.get("id") ?? "");
  if (!profile || !admin) return { ok: false, message: "ამ მოქმედებისთვის Owner ან Admin ანგარიშია საჭირო." };
  if (!uuidPattern.test(id)) return { ok: false, message: "ფასის პროფილი არასწორია." };

  try {
    const discountPercent = numberInRange(formData, "daily_deal_discount_percent", 1, 99.99);
    const { data, error } = await admin.rpc("save_daily_deal_discount_percent", {
      requested_profile_id: id,
      requested_discount_percent: discountPercent,
      actor_profile_id: profile.id,
    });
    if (error) {
      if (error.message?.includes("save_daily_deal_discount_percent") || error.message?.includes("schema cache")) {
        return { ok: false, message: "გაუშვი ბოლო Supabase migration და სცადე თავიდან." };
      }
      return { ok: false, message: "დღის შეთავაზების ფასდაკლება ვერ განახლდა. სცადე თავიდან." };
    }
    const payload = (Array.isArray(data) ? data[0] : data) as SavedDailyDealPayload<PricingProfileResult> | null;
    const saved = payload?.profile ?? null;
    if (!saved?.id) return { ok: false, message: "შენახული დღის შეთავაზების პარამეტრი ვერ დაბრუნდა." };
    const updatedDeals = Number(payload?.updated_current_deal_count ?? 0);
    revalidatePath("/admin/settings");
    revalidatePath("/");
    revalidatePath("/deals");
    revalidatePath("/deals/[slug]", "page");
    return { ok: true, message: `${saved.daily_deal_discount_percent}% ფასდაკლება შენახულია; განახლდა დღევანდელი ${updatedDeals} შეთავაზება.`, data: saved };
  } catch {
    return { ok: false, message: "ფასდაკლება უნდა იყოს 1%-დან 99.99%-მდე." };
  }
}
