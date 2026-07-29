import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_DAILY_DEAL_DISCOUNT_PERCENT = 50;

function validDiscountPercent(value: unknown) {
  const discount = Number(value);
  return Number.isFinite(discount) && discount >= 1 && discount < 100
    ? discount
    : DEFAULT_DAILY_DEAL_DISCOUNT_PERCENT;
}

export const getDailyDealDiscountPercent = cache(async () => {
  const admin = createAdminClient() as any;
  if (!admin) return DEFAULT_DAILY_DEAL_DISCOUNT_PERCENT;
  const { data, error } = await admin
    .from("pricing_profiles")
    .select("daily_deal_discount_percent")
    .eq("is_default", true)
    .maybeSingle();
  if (error) {
    console.error("[daily-deals] Failed to load the configured discount percent.", error.message);
    return DEFAULT_DAILY_DEAL_DISCOUNT_PERCENT;
  }
  return validDiscountPercent(data?.daily_deal_discount_percent);
});

export type DailyDeal = {
  dealDate: string;
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  nameEn: string;
  image: string;
  sku: string;
  sizeLabel: string;
  originalPrice: number | null;
  dealPrice: number | null;
  discountPercent: number;
  preview: boolean;
};

export function getTbilisiDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tbilisi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export async function getDailyDeals(): Promise<{ date: string; deals: DailyDeal[]; isPreview: boolean; discountPercent: number }> {
  const date = getTbilisiDate();
  const discountPercent = await getDailyDealDiscountPercent();
  const admin = createAdminClient() as any;
  if (!admin) return { date, deals: [], isPreview: true, discountPercent };

  const loadToday = () => admin
    .from("daily_deal_items")
    .select(`
      deal_date,
      product_id,
      variant_id,
      original_price,
      deal_price,
      discount_percent,
      products!daily_deal_items_product_id_fkey (
        slug,
        hooma_name,
        name_ka,
        hero_image,
        base_price,
        sale_price,
        catalog_audit_applied_at
      ),
      product_variants!daily_deal_items_variant_id_fkey (
        sku,
        size_label,
        image,
        price,
        is_active
      )
    `)
    .eq("deal_date", date)
    .order("position", { ascending: true });

  // Reconcile before every customer-facing read. The database function is
  // idempotent and removes hidden products, stale variants, and stale prices
  // before refilling today's list.
  const activation = await admin.rpc("activate_daily_deals", { target_date: date });
  const activationError: { message: string } | null = activation.error;
  if (activationError) {
    console.error("[daily-deals] Failed to activate today's deals.", activationError.message);
  }
  const { data, error } = await loadToday();

  if (error) {
    console.error("[daily-deals] Failed to load today's deals.", error.message);
    return { date, deals: [], isPreview: true, discountPercent };
  }
  if (!data?.length) return { date, deals: [], isPreview: Boolean(activationError), discountPercent };

  const deals = data.flatMap((row: any) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
    const currentPrice = Number(variant?.price ?? product?.sale_price ?? product?.base_price);
    if (!product?.catalog_audit_applied_at || variant?.is_active !== true || !Number.isFinite(currentPrice) || currentPrice <= 0) {
      return [];
    }
    return [{
      dealDate: row.deal_date,
      productId: row.product_id,
      variantId: row.variant_id,
      slug: product.slug,
      name: product.name_ka || product.hooma_name,
      nameEn: product.hooma_name || product.name_ka,
      image: variant.image || product.hero_image || "/catalog-placeholders/home.svg",
      sku: variant.sku,
      sizeLabel: variant.size_label || "Standard",
      originalPrice: Number(row.original_price),
      dealPrice: Number(row.deal_price),
      discountPercent: validDiscountPercent(row.discount_percent),
      preview: false,
    } satisfies DailyDeal];
  });

  if (!deals.length) return { date, deals: [], isPreview: Boolean(activationError), discountPercent };
  return { date, deals, isPreview: false, discountPercent: deals[0]?.discountPercent ?? discountPercent };
}
