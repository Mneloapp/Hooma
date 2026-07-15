import "server-only";

import { cache } from "react";
import { products as previewProducts, type Product, type ProductCategory, type ProductVariant } from "@/data/products";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

type CategoryRow = { id: string; parent_id: string | null; slug: string; name_en: string; name_ka: string };

const categoryNames: Record<string, ProductCategory> = {
  "home-organization": "Home & Organization",
  "desk-tech": "Desk & Tech",
  kitchen: "Kitchen",
  "kids-learning": "Kids & Learning",
  pets: "Pets",
  "car-accessories": "Car Accessories",
  "gifts-personalization": "Gifts & Personalization",
  "custom-parts": "Custom Parts",
};

const categoryPlaceholders: Record<string, string> = {
  "home-organization": "/catalog-placeholders/home.svg",
  "desk-tech": "/catalog-placeholders/desk-tech.svg",
  kitchen: "/catalog-placeholders/kitchen.svg",
  "kids-learning": "/catalog-placeholders/kids.svg",
  pets: "/catalog-placeholders/pets.svg",
  "car-accessories": "/catalog-placeholders/car.svg",
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

export const getStorefrontCatalog = cache(async (): Promise<Product[]> => {
  const admin = createAdminClient() as any;
  if (!admin) return previewProducts.filter((product) => product.categorySlug !== "custom-parts");

  const [{ data: productRows, error: productError }, { data: categoryRows, error: categoryError }] = await Promise.all([
    admin
      .from("products")
      .select("id,slug,hooma_name,name_ka,category_id,short_description,short_description_ka,long_description,hero_image,gallery_images,video_url,tags,is_featured,price_placeholder,currency,base_price,delivery_estimate,lead_time_business_days,estimated_print_minutes")
      .eq("status", "active")
      .eq("production_status", "approved")
      .order("created_at", { ascending: false }),
    admin.from("categories").select("id,parent_id,slug,name_en,name_ka").eq("is_active", true),
  ]);
  if (productError || categoryError || !productRows?.length) return previewProducts.filter((product) => product.categorySlug !== "custom-parts");

  const productIds = productRows.map((row: any) => row.id);
  const [{ data: variantRows, error: variantError }, { data: sourceRows, error: sourceError }] = await Promise.all([
    admin
      .from("product_variants")
      .select("id,product_id,sku,size_label,layout_label,product_dimensions_cm,packing_dimensions_cm,gross_weight_kg,image,price,price_placeholder,available_colors,material,is_active")
      .in("product_id", productIds)
      .eq("is_active", true),
    admin
      .from("product_sources")
      .select("product_id,platform,source_url,creator_name,license_status,commercial_use_allowed,media_use_allowed")
      .in("product_id", productIds)
      .in("license_status", ["verified", "not_required"])
      .eq("commercial_use_allowed", true)
      .eq("media_use_allowed", true),
  ]);
  if (variantError || sourceError) return previewProducts.filter((product) => product.categorySlug !== "custom-parts");

  const categories = new Map(((categoryRows ?? []) as CategoryRow[]).map((row) => [row.id, row]));
  const variantsByProduct = new Map<string, any[]>();
  for (const variant of variantRows ?? []) variantsByProduct.set(variant.product_id, [...(variantsByProduct.get(variant.product_id) ?? []), variant]);
  const sourceByProduct = new Map<string, any>();
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
    const categorySlug = parentCategory?.slug ?? "home-organization";
    const subcategory = selectedCategory?.parent_id ? selectedCategory : null;
    const placeholder = categoryPlaceholders[categorySlug] ?? "/catalog-placeholders/home.svg";
    const heroImage = safeCatalogImage(row.hero_image, placeholder);
    const galleryImages: string[] = Array.from(new Set<string>((Array.isArray(row.gallery_images) ? row.gallery_images : []).map((image: unknown) => safeCatalogImage(image, heroImage))));

    const variants: ProductVariant[] = rawVariants.map((variant) => {
      const material = typeof variant.material === "string" && variant.material ? variant.material : "PLA+";
      const availableColors = Array.isArray(variant.available_colors) && variant.available_colors.length ? variant.available_colors : ["სტანდარტული"];
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
      };
    });
    const availableMaterials = Array.from(new Set(variants.flatMap((variant) => variant.availableMaterials)));
    const availableColors = Array.from(new Set(variants.flatMap((variant) => variant.availableColors)));
    const price = Math.min(...variants.map((variant) => variant.price ?? Number.POSITIVE_INFINITY));

    return [{
      id: row.id,
      slug: row.slug,
      hoomaName: row.hooma_name,
      nameKa: row.name_ka || row.hooma_name,
      category: categoryNames[categorySlug] ?? "Home & Organization",
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
    }];
  });

  return catalog.length ? catalog : previewProducts.filter((product) => product.categorySlug !== "custom-parts");
});

export async function getStorefrontProductBySlug(slug: string) {
  const catalog = await getStorefrontCatalog();
  return catalog.find((product) => product.slug === slug)
    ?? previewProducts.find((product) => product.slug === slug);
}

export async function getAdminPreviewProductById(productId: string): Promise<Product | null> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(productId)) return null;
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin) return null;

  const [{ data: row }, { data: categoryRows }, { data: variantRows }, { data: sourceRows }] = await Promise.all([
    admin.from("products").select("id,slug,hooma_name,name_ka,category_id,short_description,short_description_ka,long_description,hero_image,gallery_images,video_url,tags,is_featured,price_placeholder,currency,base_price,delivery_estimate,lead_time_business_days,estimated_print_minutes").eq("id", productId).maybeSingle(),
    admin.from("categories").select("id,parent_id,slug,name_en,name_ka").eq("is_active", true),
    admin.from("product_variants").select("id,product_id,sku,size_label,layout_label,product_dimensions_cm,packing_dimensions_cm,gross_weight_kg,image,price,price_placeholder,available_colors,material,is_active").eq("product_id", productId).eq("is_active", true),
    admin.from("product_sources").select("platform,creator_name").eq("product_id", productId).limit(1),
  ]);
  if (!row) return null;

  const categories = new Map(((categoryRows ?? []) as CategoryRow[]).map((category) => [category.id, category]));
  const selectedCategory = row.category_id ? categories.get(row.category_id) : null;
  const parentCategory = selectedCategory?.parent_id ? categories.get(selectedCategory.parent_id) : selectedCategory;
  const categorySlug = parentCategory?.slug ?? "home-organization";
  const subcategory = selectedCategory?.parent_id ? selectedCategory : null;
  const placeholder = categoryPlaceholders[categorySlug] ?? "/catalog-placeholders/home.svg";
  const heroImage = safeCatalogImage(row.hero_image, placeholder);
  const galleryImages: string[] = Array.from(new Set<string>((Array.isArray(row.gallery_images) ? row.gallery_images : []).map((image: unknown) => safeCatalogImage(image, heroImage))));
  const rawVariants = (variantRows ?? []).filter((variant: any) => Number(variant.price ?? row.base_price) > 0);
  if (!rawVariants.length) return null;

  const variants: ProductVariant[] = rawVariants.map((variant: any) => {
    const material = typeof variant.material === "string" && variant.material ? variant.material : "PLA+";
    const availableColors = Array.isArray(variant.available_colors) && variant.available_colors.length ? variant.available_colors : ["სტანდარტული"];
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
    };
  });
  const availableMaterials = Array.from(new Set(variants.flatMap((variant) => variant.availableMaterials)));
  const availableColors = Array.from(new Set(variants.flatMap((variant) => variant.availableColors)));
  const price = Math.min(...variants.map((variant) => variant.price ?? Number.POSITIVE_INFINITY));
  const source = sourceRows?.[0];

  return {
    id: row.id,
    slug: row.slug,
    hoomaName: row.hooma_name,
    nameKa: row.name_ka || row.hooma_name,
    category: categoryNames[categorySlug] ?? "Home & Organization",
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
  };
}
