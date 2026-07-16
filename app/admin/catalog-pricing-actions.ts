"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type CatalogPricePreviewInput = {
  materialProfileId: string;
  pricingProfileId: string;
  materialGrams: number;
  printMinutes: number;
  marginPercent: number;
};

export type CatalogPriceBreakdown = {
  materialCost: number;
  machineCost: number;
  laborCost: number;
  packagingCost: number;
  overheadCost: number;
  failureReserveCost: number;
  productionCost: number;
  marginPercent: number;
  salePriceBeforeVat: number;
  vatPercent: number;
  vatAmount: number;
  finalSalePrice: number;
  currency: "GEL";
};

export type CatalogPricePreviewResult =
  | { ok: true; data: CatalogPriceBreakdown }
  | { ok: false; message: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const asNumber = (value: unknown) => Number(value);
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export async function calculateCatalogPricePreviewAction(
  input: CatalogPricePreviewInput,
): Promise<CatalogPricePreviewResult> {
  const profile = await requirePermission("pricing.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !["owner", "admin"].includes(profile.role)) {
    return { ok: false, message: "ფასის კალკულაცია მხოლოდ Owner-ს ან Admin-ს შეუძლია." };
  }

  const materialProfileId = String(input.materialProfileId ?? "");
  const pricingProfileId = String(input.pricingProfileId ?? "");
  const materialGrams = asNumber(input.materialGrams);
  const printMinutes = asNumber(input.printMinutes);
  const marginPercent = asNumber(input.marginPercent);
  if (!uuidPattern.test(materialProfileId) || !uuidPattern.test(pricingProfileId)) {
    return { ok: false, message: "მასალის ან ფასის პროფილი არასწორია." };
  }
  if (!Number.isFinite(materialGrams) || materialGrams <= 0 || materialGrams > 1_000_000) {
    return { ok: false, message: "წონა არასწორია." };
  }
  if (!Number.isInteger(printMinutes) || printMinutes < 1 || printMinutes > 999_999) {
    return { ok: false, message: "ბეჭდვის დრო არასწორია." };
  }
  if (!Number.isFinite(marginPercent) || marginPercent < 0 || marginPercent >= 100) {
    return { ok: false, message: "მარჟა უნდა იყოს 0-დან 99.99%-მდე." };
  }

  const { data, error } = await admin.rpc("calculate_catalog_price", {
    requested_material_profile_id: materialProfileId,
    requested_pricing_profile_id: pricingProfileId,
    requested_material_grams: materialGrams,
    requested_print_minutes: printMinutes,
    requested_margin_percent: marginPercent,
  });
  if (error || !data) {
    return { ok: false, message: "ფასის სერვერული კალკულაცია ვერ შესრულდა." };
  }

  const salePriceBeforeVat = asNumber(data.sale_price_before_vat);
  const vatPercent = asNumber(data.vat_percent);
  const result: CatalogPriceBreakdown = {
    materialCost: asNumber(data.material_cost),
    machineCost: asNumber(data.machine_cost),
    laborCost: asNumber(data.labor_cost),
    packagingCost: asNumber(data.packaging_cost),
    overheadCost: asNumber(data.overhead_cost),
    failureReserveCost: asNumber(data.failure_reserve_cost),
    productionCost: asNumber(data.production_cost),
    marginPercent: asNumber(data.margin_percent),
    salePriceBeforeVat,
    vatPercent,
    vatAmount: roundMoney((salePriceBeforeVat * vatPercent) / 100),
    finalSalePrice: asNumber(data.final_sale_price),
    currency: "GEL",
  };
  if (Object.values(result).some((value) => typeof value === "number" && !Number.isFinite(value))) {
    return { ok: false, message: "ფასის კალკულაციამ არასწორი შედეგი დააბრუნა." };
  }
  return { ok: true, data: result };
}
