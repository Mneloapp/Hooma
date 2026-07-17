import "server-only";

import { cache } from "react";
import type { Product, ProductCategory, ProductVariant } from "@/data/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

type CategoryRow = { id: string; parent_id: string | null; slug: string; name_en: string; name_ka: string };

const categoryNames: Record<string, ProductCategory> = {
  "3d-printer": "3D Printer",
  art: "Art",
  education: "Education",
  fashion: "Fashion",
  "hobbies-diy": "Hobby & DIY",
  household: "Household",
  miniatures: "Miniatures",
  "props-cosplay": "Props & Cosplay",
  tools: "Tools",
  "toys-games": "Toys & Games",
  "generative-3d-model": "Generative 3D Model",
  "custom-parts": "Custom Parts",
};

const categoryPlaceholders: Record<string, string> = {
  "3d-printer": "/catalog-placeholders/desk-tech.svg",
  art: "/catalog-placeholders/home.svg",
  education: "/catalog-placeholders/kids.svg",
  fashion: "/catalog-placeholders/custom.svg",
  "hobbies-diy": "/catalog-placeholders/desk-tech.svg",
  household: "/catalog-placeholders/home.svg",
  miniatures: "/catalog-placeholders/custom.svg",
  "props-cosplay": "/catalog-placeholders/custom.svg",
  tools: "/catalog-placeholders/home.svg",
  "toys-games": "/catalog-placeholders/kids.svg",
  "generative-3d-model": "/catalog-placeholders/custom.svg",
  "custom-parts": "/catalog-placeholders/custom.svg",
};

function safeCatalogImage(value: unknown, fallback: string) {
  if (typeof value !== "string" || !value.trim()) return fallback;
  if (value.startsWith("/")) return value;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const isLegacyCatalogHost = host === "makerworld.bblmw.com" || host.endsWith(".bblmw.com");
    const isHoomaMedia = host.endsWith(".supabase.co") && url.pathname.startsWith("/storage/v1/object/public/product-media/");
    return url.protocol === "https:" && (isLegacyCatalogHost || isHoomaMedia) ? url.toString() : fallback;
  } catch {
    return fallback;
  }
}

function safeCatalogVideo(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname.toLowerCase().endsWith(".supabase.co")
      && url.pathname.startsWith("/storage/v1/object/public/product-media/")
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function dimensionLabel(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Standard";
  const row = value as Record<string, unknown>;
  const parts = [row.x, row.y, row.z].filter((item) => typeof item === "number" || typeof item === "string");
  return parts.length ? `${parts.join(" × ")} ${typeof row.unit === "string" ? row.unit : "mm"}` : "Standard";
}

function safeSourceUrl(value: unknown) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    const supportedHosts = ["makerworld.com", "printables.com", "thingiverse.com", "thangs.com", "myminifactory.com", "cults3d.com"];
    return url.protocol === "https:" && supportedHosts.some((supported) => host === supported || host.endsWith(`.${supported}`));
  } catch {
    return false;
  }
}

function variantColorProfile(value: unknown) {
  const attributes = value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const fixedColorPalette = Array.isArray(attributes.fixed_color_palette)
    ? attributes.fixed_color_palette.filter((color): color is string => typeof color === "string" && Boolean(color.trim()))
    : [];
  const fixedMulticolor = attributes.color_mode === "fixed_multicolor" && attributes.ams_required === true && fixedColorPalette.length >= 2;
  return {
    colorMode: fixedMulticolor ? "fixed_multicolor" as const : "customer_choice" as const,
    amsRequired: fixedMulticolor,
  };
}

export const getStorefrontCatalog = cache(async (): Promise<Product[]> => {
  const admin = createAdminClient() as any;
  if (!admin) {
    console.error("[storefront-catalog] Supabase admin client is not configured; returning an empty catalog.");
    return [];
  }

  const [{ data: productRows, error: productError }, { data: categoryRows, error: categoryError }] = await Promise.all([
    admin
      .from("products")
      .select("id,slug,hooma_name,name_ka,category_id,short_description,short_description_ka,long_description,hero_image,gallery_images,video_url,tags,is_featured,price_placeholder,currency,base_price,delivery_estimate,lead_time_business_days,estimated_print_minutes")
      .eq("status", "active")
      .eq("production_status", "approved")
      .order("created_at", { ascending: false }),
    admin.from("categories").select("id,parent_id,slug,name_en,name_ka"),
  ]);
  if (productError || categoryError) {
    console.error("[storefront-catalog] Failed to load products or categories.", {
      productError: productError?.message,
      categoryError: categoryError?.message,
    });
    return [];
  }
  if (!productRows?.length) return [];

  const productIds = productRows.map((row: any) => row.id);
  const [
    { data: variantRows, error: variantError },
    { data: sourceRows, error: sourceError },
    { data: metricRows },
  ] = await Promise.all([
    admin
      .from("product_variants")
      .select("id,product_id,sku,size_label,layout_label,product_dimensions_cm,packing_dimensions_cm,gross_weight_kg,image,price,price_placeholder,available_colors,material,attributes,is_active")
      .in("product_id", productIds)
      .eq("is_active", true),
    admin
      .from("product_sources")
      .select("product_id,platform,source_url,creator_name,license_status,commercial_use_allowed,media_use_allowed")
      .in("product_id", productIds)
      .in("license_status", ["verified", "not_required"])
      .eq("commercial_use_allowed", true)
      .eq("media_use_allowed", true),
    admin
      .from("product_public_metrics")
      .select("product_id,average_rating,rating_count,review_count,sold_quantity,popularity_score")
      .in("product_id", productIds),
  ]);
  if (variantError || sourceError) {
    console.error("[storefront-catalog] Failed to load product variants or sources.", {
      variantError: variantError?.message,
      sourceError: sourceError?.message,
    });
    return [];
  }

  const categories = new Map(((categoryRows ?? []) as CategoryRow[]).map((row) => [row.id, row]));
  const variantsByProduct = new Map<string, any[]>();
  for (const variant of variantRows ?? []) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), variant]);
  const sourceByProduct = new Map<string, any>();
  const metricsByProduct = new Map<string, any>((metricRows ?? []).map((row: any) => [row.product_id, row]));
  for (const source of sourceRows ?? []) {
    const sourceAllowed = source.platform === "hooma" || safeSourceUrl(source.source_url);
    if (sourceAllowed && !sourceByProduct.has(source.product_id)) sourceByProduct.set(source.product_id, source);
  }

  const catalog = productRows.flatMap((row: any): Product[] => {
    const source = sourceByProduct.get(row.id);
    if (!source) return [];
    const rawVariants = (variantsByProduct.get(row.id) ?? []).filter((variant) => Number(variant.price ?? row.base_price) > 0);
    if (!rawVariants.length) return [];

    const selectedCategory = row.category_id ? categories.get(row.category_id) : null;
    const parentCategory = selectedCategory?.parent_id ? categories.get(selectedCategory.parent_id) : selectedCategory;
    const categorySlug = parentCategory?.slug ?? "household";
    if (categorySlug === "custom-parts") return [];
    const subcategory = selectedCategory?.parent_id ? selectedCategory : null;
    const placeholder = categoryPlaceholders[categorySlug] ?? "/catalog-placeholders/home.svg";
    const heroImage = safeCatalogImage(row.hero_image, placeholder);
    const galleryImages: string[] = Array.from(new Set<string>((Array.isArray(row.gallery_images) ? row.gallery_images : []).map((image: unknown) => safeCatalogImage(image, heroImage))));

    const variants: ProductVariant[] = rawVariants.map((variant) => {
      const material = typeof variant.material === "string" && variant.material ? variant.material : "PLA+";
      const availableColors = Array.isArray(variant.available_colors) && variant.available_colors.length ? variant.available_colors : ["სტანდარტული"];
      const colorProfile = variantColorProfile(variant.attributes);
      const price = Number(variant.price ?? row.base_price);
      return {
        id: variant.id,
        sku: variant.sku,
        sizeLabel: variant.size_label || "Standard",
        layoutLabel: variant.layout_label || "Catalog",
        productDimensionsCm: dimensionLabel(variant.product_dimensions_cm),
        packingDimensionsCm: dimensionLabel(variant.packing_dimensions_cm),
        grossWeightKg: variant.gross_weight_kg === null ? "—" : String(variant.gross_weight_kg),
        image: safeCatalogImage(variant.image, heroImage),
        price,
        pricePlaceholder: variant.price_placeholder || row.price_placeholder || "ფასი დამტკიცებულია",
        availableColors,
        availableMaterials: [material],
        ...colorProfile,
      };
    });
    const availableMaterials = Array.from(new Set(variants.flatMap((variant) => variant.availableMaterials)));
    const availableColors = Array.from(new Set(variants.flatMap((variant) => variant.availableColors)));
    const price = Math.min(...variants.map((variant) => variant.price ?? Number.POSITIVE_INFINITY));
    const metrics = metricsByProduct.get(row.id);

    return [{
      id: row.id,
      slug: row.slug,
      hoomaName: row.hooma_name,
      nameKa: row.name_ka || row.hooma_name,
      category: categoryNames[categorySlug] ?? "Household",
      categorySlug,
      subcategory: subcategory?.name_en || parentCategory?.name_en || "Catalog",
      subcategorySlug: subcategory?.slug || categorySlug,
      shortDescription: row.short_description || "Made on demand by Hooma.",
      shortDescriptionKa: row.short_description_ka || row.short_description || "პროდუქტი მზადდება შეკვეთის შემდეგ.",
      longDescription: row.long_description || row.short_description || "",
      heroImage,
      galleryImages: galleryImages.length ? galleryImages : [heroImage],
      videoUrl: safeCatalogVideo(row.video_url),
      variants,
      availableMaterials,
      availableColors,
      tags: Array.isArray(row.tags) ? row.tags : [],
      isFeatured: Boolean(row.is_featured),
      price: Number.isFinite(price) ? price : Number(row.base_price),
      pricePlaceholder: row.price_placeholder || "ფასი დამტკიცებულია",
      currency: "GEL",
      deliveryEstimate: row.delivery_estimate || "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე",
      leadTimeDays: Number(row.lead_time_business_days || 3),
      estimatedPrintHours: row.estimated_print_minutes ? Number(row.estimated_print_minutes) / 60 : null,
      licenseStatus: source.license_status === "not_required" ? "not_required" : "verified",
      sourcePlatform: source.platform === "hooma" ? "hooma" : source.platform === "makerworld" ? "makerworld" : "external",
      sourceCreator: source.creator_name || undefined,
      isOrderable: true,
      ratingAverage: Number(metrics?.average_rating ?? 0),
      ratingCount: Number(metrics?.rating_count ?? 0),
      reviewCount: Number(metrics?.review_count ?? 0),
      salesCount: Number(metrics?.sold_quantity ?? 0),
      popularityScore: Number(metrics?.popularity_score ?? (row.is_featured ? 0.75 : 0)),
    }];
  });

  return catalog;
});

export async function getStorefrontProductBySlug(slug: string) {
  const catalog = await getStorefrontCatalog();
  return catalog.find((product) => product.slug === slug);
}

export async function getAdminPreviewProductById(productId: string): Promise<Product | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return null;
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin) return null;

  const [{ data: row }, { data: categoryRows }, { data: variantRows }, { data: sourceRows }, { data: metricRows }] = await Promise.all([
    admin.from("products").select("id,slug,hooma_name,name_ka,category_id,short_description,short_description_ka,long_description,hero_image,gallery_images,video_url,tags,is_featured,price_placeholder,currency,base_price,delivery_estimate,lead_time_business_days,estimated_print_minutes").eq("id", productId).maybeSingle(),
    admin.from("categories").select("id,parent_id,slug,name_en,name_ka"),
    admin.from("product_variants").select("id,product_id,sku,size_label,layout_label,product_dimensions_cm,packing_dimensions_cm,gross_weight_kg,image,price,price_placeholder,available_colors,material,attributes,is_active").eq("product_id", productId).eq("is_active", true),
    admin.from("product_sources").select("platform,creator_name").eq("product_id", productId).limit(1),
    admin.from("product_public_metrics").select("average_rating,rating_count,review_count,sold_quantity,popularity_score").eq("product_id", productId).limit(1),
  ]);
  if (!row) return null;

  const categories = new Map(((categoryRows ?? []) as CategoryRow[]).map((category) => [category.id, category]));
  const selectedCategory = row.category_id ? categories.get(row.category_id) : null;
  const parentCategory = selectedCategory?.parent_id ? categories.get(selectedCategory.parent_id) : selectedCategory;
  const categorySlug = parentCategory?.slug ?? "household";
  const subcategory = selectedCategory?.parent_id ? selectedCategory : null;
  const placeholder = categoryPlaceholders[categorySlug] ?? "/catalog-placeholders/home.svg";
  const heroImage = safeCatalogImage(row.hero_image, placeholder);
  const galleryImages: string[] = Array.from(new Set<string>((Array.isArray(row.gallery_images) ? row.gallery_images : []).map((image: unknown) => safeCatalogImage(image, heroImage))));
  const rawVariants = (variantRows ?? []).filter((variant: any) => Number(variant.price ?? row.base_price) > 0);
  if (!rawVariants.length) return null;

  const variants: ProductVariant[] = rawVariants.map((variant: any) => {
    const material = typeof variant.material === "string" && variant.material ? variant.material : "PLA+";
    const availableColors = Array.isArray(variant.available_colors) && variant.available_colors.length ? variant.available_colors : ["სტანდარტული"];
    const colorProfile = variantColorProfile(variant.attributes);
    return {
      id: variant.id,
      sku: variant.sku,
      sizeLabel: variant.size_label || "Standard",
      layoutLabel: variant.layout_label || "Catalog preview",
      productDimensionsCm: dimensionLabel(variant.product_dimensions_cm),
      packingDimensionsCm: dimensionLabel(variant.packing_dimensions_cm),
      grossWeightKg: variant.gross_weight_kg === null ? "—" : String(variant.gross_weight_kg),
      image: safeCatalogImage(variant.image, heroImage),
      price: Number(variant.price ?? row.base_price),
      pricePlaceholder: variant.price_placeholder || row.price_placeholder || "ფასი დამტკიცებულია",
      availableColors,
      availableMaterials: [material],
      ...colorProfile,
    };
  });
  const availableMaterials = Array.from(new Set(variants.flatMap((variant) => variant.availableMaterials)));
  const availableColors = Array.from(new Set(variants.flatMap((variant) => variant.availableColors)));
  const price = Math.min(...variants.map((variant) => variant.price ?? Number.POSITIVE_INFINITY));
  const source = sourceRows?.[0];
  const metrics = metricRows?.[0];

  return {
    id: row.id,
    slug: row.slug,
    hoomaName: row.hooma_name,
    nameKa: row.name_ka || row.hooma_name,
    category: categoryNames[categorySlug] ?? "Household",
    categorySlug,
    subcategory: subcategory?.name_en || parentCategory?.name_en || "Catalog",
    subcategorySlug: subcategory?.slug || categorySlug,
    shortDescription: row.short_description || "Made on demand by Hooma.",
    shortDescriptionKa: row.short_description_ka || row.short_description || "პროდუქტი მზადდება შეკვეთის შემდეგ.",
    longDescription: row.long_description || row.short_description || "",
    heroImage,
    galleryImages: galleryImages.length ? galleryImages : [heroImage],
    videoUrl: safeCatalogVideo(row.video_url),
    variants,
    availableMaterials,
    availableColors,
    tags: Array.isArray(row.tags) ? row.tags : [],
    isFeatured: Boolean(row.is_featured),
    price: Number.isFinite(price) ? price : Number(row.base_price),
    pricePlaceholder: row.price_placeholder || "ფასი დამტკიცებულია",
    currency: "GEL",
    deliveryEstimate: row.delivery_estimate || "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე",
    leadTimeDays: Number(row.lead_time_business_days || 3),
    estimatedPrintHours: row.estimated_print_minutes ? Number(row.estimated_print_minutes) / 60 : null,
    licenseStatus: "pending",
    sourcePlatform: source?.platform === "makerworld" ? "makerworld" : source?.platform === "hooma" ? "hooma" : source ? "external" : "other",
    sourceCreator: source?.creator_name || undefined,
    isOrderable: false,
    ratingAverage: Number(metrics?.average_rating ?? 0),
    ratingCount: Number(metrics?.rating_count ?? 0),
    reviewCount: Number(metrics?.review_count ?? 0),
    salesCount: Number(metrics?.sold_quantity ?? 0),
    popularityScore: Number(metrics?.popularity_score ?? (row.is_featured ? 0.75 : 0)),
  };
}
