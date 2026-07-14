"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type HoomaProductState = { ok?: boolean; message?: string; productId?: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const clean = (value: FormDataEntryValue | null, max: number) => String(value ?? "").trim().slice(0, max);

function positiveNumber(formData: FormData, key: string, max: number) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${key} არასწორია.`);
  return value;
}

export async function createHoomaProductAction(_state: HoomaProductState, formData: FormData): Promise<HoomaProductState> {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !["owner", "admin"].includes(profile.role)) {
    return { ok: false, message: "პროდუქტის დამატება მხოლოდ Admin-ს ან Owner-ს შეუძლია." };
  }

  const categoryId = clean(formData.get("category_id"), 36);
  const materialId = clean(formData.get("material_profile_id"), 36);
  const pricingId = clean(formData.get("pricing_profile_id"), 36);
  if (![categoryId, materialId, pricingId].every((value) => uuidPattern.test(value))) {
    return { ok: false, message: "კატეგორია, მასალა ან ფასის პროფილი არასწორია." };
  }

  const nameEn = clean(formData.get("name_en"), 160);
  const nameKa = clean(formData.get("name_ka"), 160);
  const slug = clean(formData.get("slug"), 160).toLowerCase();
  if (nameEn.length < 2 || nameKa.length < 2 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, message: "შეავსე ორივე სახელი და სწორი ინგლისური slug." };
  }

  try {
    const grams = positiveNumber(formData, "material_grams", 1_000_000);
    const minutes = Math.round(positiveNumber(formData, "print_minutes", 1_000_000));
    const plateCount = Math.round(positiveNumber(formData, "plate_count", 100));
    const margin = Number(formData.get("margin_percent"));
    if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error("მარჟა უნდა იყოს 0-დან 99.99%-მდე.");
    const dimensions = {
      x: positiveNumber(formData, "dimension_x", 100_000),
      y: positiveNumber(formData, "dimension_y", 100_000),
      z: positiveNumber(formData, "dimension_z", 100_000),
      unit: "mm",
    };

    const { data, error } = await admin.rpc("create_hooma_product_draft", {
      actor_profile_id: profile.id,
      product_name_en: nameEn,
      product_name_ka: nameKa,
      product_slug: slug,
      product_description: clean(formData.get("description"), 3_000),
      selected_category_id: categoryId,
      selected_material_profile_id: materialId,
      selected_pricing_profile_id: pricingId,
      selected_material_grams: grams,
      selected_print_minutes: minutes,
      selected_margin_percent: margin,
      selected_plate_count: plateCount,
      selected_dimensions: dimensions,
    });
    if (error || !data) {
      const message = error?.message ?? "Product Draft ვერ შეიქმნა.";
      if (message.includes("duplicate") || message.includes("products_slug_key")) return { ok: false, message: "ეს Slug უკვე გამოყენებულია." };
      if (message.includes("Active category and material")) return { ok: false, message: "არჩეული კატეგორია ან მასალა აღარ არის აქტიური." };
      return { ok: false, message: "პროდუქტის Draft ვერ შეიქმნა. გადაამოწმე მონაცემები." };
    }

    revalidatePath("/admin/products");
    revalidatePath("/admin/products/new");
    return { ok: true, productId: String(data), message: "Hooma პროდუქტის Draft შეიქმნა." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ტექნიკური მონაცემები არასწორია." };
  }
}
