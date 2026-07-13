import "server-only";

import { products } from "@/data/products";
import { createAdminClient } from "@/lib/supabase/admin";

export type DailyDeal = {
  dealDate: string;
  productId: string;
  variantId: string;
  slug: string;
  name: string;
  description: string;
  image: string;
  sku: string;
  sizeLabel: string;
  originalPrice: number | null;
  dealPrice: number | null;
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

function previewDeals(date: string): DailyDeal[] {
  return products
    .filter((product) => product.categorySlug !== "custom-parts")
    .slice(0, 100)
    .map((product) => {
      const variant = product.variants[0];
      return {
        dealDate: date,
        productId: product.id,
        variantId: variant.id,
        slug: product.slug,
        name: product.nameKa,
        description: product.shortDescriptionKa,
        image: variant.image,
        sku: variant.sku,
        sizeLabel: variant.sizeLabel,
        originalPrice: variant.price,
        dealPrice: variant.price === null ? null : Math.round(variant.price * 50) / 100,
        preview: true,
      };
    });
}

export async function getDailyDeals(): Promise<{ date: string; deals: DailyDeal[]; isPreview: boolean }> {
  const date = getTbilisiDate();
  const admin = createAdminClient() as any;
  if (!admin) return { date, deals: previewDeals(date), isPreview: true };

  const { error: activationError } = await admin.rpc("activate_daily_deals", { target_date: date });
  if (activationError) return { date, deals: previewDeals(date), isPreview: true };

  const { data, error } = await admin
    .from("daily_deal_items")
    .select(`
      deal_date,
      product_id,
      variant_id,
      original_price,
      deal_price,
      products!daily_deal_items_product_id_fkey (
        slug,
        hooma_name,
        name_ka,
        short_description,
        short_description_ka,
        hero_image
      ),
      product_variants!daily_deal_items_variant_id_fkey (
        sku,
        size_label,
        image
      )
    `)
    .eq("deal_date", date)
    .order("position", { ascending: true });

  if (error || !data?.length) return { date, deals: previewDeals(date), isPreview: true };

  const deals = data.map((row: any) => {
    const product = Array.isArray(row.products) ? row.products[0] : row.products;
    const variant = Array.isArray(row.product_variants) ? row.product_variants[0] : row.product_variants;
    return {
      dealDate: row.deal_date,
      productId: row.product_id,
      variantId: row.variant_id,
      slug: product.slug,
      name: product.name_ka || product.hooma_name,
      description: product.short_description_ka || product.short_description || "",
      image: variant.image || product.hero_image || "/catalog-placeholders/home.svg",
      sku: variant.sku,
      sizeLabel: variant.size_label || "Standard",
      originalPrice: Number(row.original_price),
      dealPrice: Number(row.deal_price),
      preview: false,
    } satisfies DailyDeal;
  });

  return { date, deals, isPreview: false };
}
