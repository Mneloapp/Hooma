import "server-only";

import type { Product, ProductCategory, ProductVariant } from "@/data/products";
import type { ProductCardData } from "@/lib/product-card";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

type CategoryRow = { id: string; parent_id: string | null; slug: string; name_en: string; name_ka: string };

type StorefrontCardRow = {
  id: string;
  slug: string;
  hooma_name: string;
  name_ka: string;
  category_slug: string;
  category_name_en: string;
  category_name_ka: string;
  subcategory_slug: string;
  subcategory_name_en: string;
  subcategory_name_ka: string;
  hero_image: string | null;
  price: number | string;
  price_placeholder: string;
  lead_time_days: number;
  rating_average: number | string;
  rating_count: number;
  sales_count: number;
  popularity_score: number | string;
};

export type StorefrontCatalogPageOptions = {
  category?: string;
  subcategory?: string;
  query?: string;
  material?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
};

export type StorefrontCatalogPage = {
  products: ProductCardData[];
  totalCount: number;
};

export type StorefrontHomeCards = {
  popularProducts: ProductCardData[];
  categoryProducts: Record<string, ProductCardData[]>;
};

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

function toStorefrontCard(row: StorefrontCardRow): ProductCardData {
  const fallback = categoryPlaceholders[row.category_slug] ?? "/catalog-placeholders/home.svg";
  return {
    id: row.id,
    slug: row.slug,
    hoomaName: row.hooma_name,
    nameKa: row.name_ka || row.hooma_name,
    category: categoryNames[row.category_slug] ?? "Household",
    categorySlug: row.category_slug,
    subcategory: row.subcategory_name_en || row.category_name_en || "Catalog",
    subcategorySlug: row.subcategory_slug || row.category_slug,
    heroImage: safeCatalogImage(row.hero_image, fallback),
    price: Number(row.price),
    pricePlaceholder: row.price_placeholder || "ფასი დამტკიცებულია",
    leadTimeDays: Number(row.lead_time_days || 3),
    isOrderable: true,
    ratingAverage: Number(row.rating_average || 0),
    ratingCount: Number(row.rating_count || 0),
    salesCount: Number(row.sales_count || 0),
    popularityScore: Number(row.popularity_score || 0),
  };
}

function storefrontCardSelect() {
  return "id:product_id,slug,hooma_name,name_ka,category_slug,category_name_en,category_name_ka,subcategory_slug,subcategory_name_en,subcategory_name_ka,hero_image,price,price_placeholder,lead_time_days,rating_average,rating_count,sales_count,popularity_score";
}

export async function getStorefrontCatalogPage(options: StorefrontCatalogPageOptions = {}): Promise<StorefrontCatalogPage> {
  const admin = createAdminClient() as any;
  if (!admin) return { products: [], totalCount: 0 };

  const { data, error } = await admin.rpc("get_storefront_catalog_page_v1", {
    requested_category: options.category?.trim() || null,
    requested_subcategory: options.subcategory?.trim() || null,
    requested_query: options.query?.trim() || null,
    requested_material: options.material?.trim() || null,
    requested_sort: options.sort || "featured",
    requested_page: options.page || 1,
    requested_page_size: options.pageSize || 36,
  });
  if (error) {
    console.error("[storefront-catalog] Failed to load the requested catalog page.", error.message);
    return { products: [], totalCount: 0 };
  }

  const payload = data && typeof data === "object" && !Array.isArray(data) ? data as Record<string, unknown> : {};
  const rows = Array.isArray(payload.items) ? payload.items as StorefrontCardRow[] : [];
  return {
    products: rows.map(toStorefrontCard),
    totalCount: Number(payload.total_count || 0),
  };
}

export async function getStorefrontHomeCards(perSection = 12): Promise<StorefrontHomeCards> {
  const admin = createAdminClient() as any;
  if (!admin) return { popularProducts: [], categoryProducts: {} };

  const { data, error } = await admin.rpc("get_storefront_home_cards_v1", {
    requested_per_section: perSection,
  });
  if (error) {
    console.error("[storefront-catalog] Failed to load home catalog sections.", error.message);
    return { popularProducts: [], categoryProducts: {} };
  }

  const popularProducts: ProductCardData[] = [];
  const categoryProducts: Record<string, ProductCardData[]> = {};
  for (const row of (data ?? []) as Array<StorefrontCardRow & { section_key: string }>) {
    const card = toStorefrontCard(row);
    if (row.section_key === "popular") {
      popularProducts.push(card);
    } else {
      categoryProducts[row.section_key] = [...(categoryProducts[row.section_key] ?? []), card];
    }
  }
  return { popularProducts, categoryProducts };
}

export async function getStorefrontProductCardsByIds(productIds: string[]): Promise<ProductCardData[]> {
  const uniqueIds = Array.from(new Set(productIds)).slice(0, 60);
  if (!uniqueIds.length) return [];
  const admin = createAdminClient() as any;
  if (!admin) return [];

  const { data, error } = await admin
    .from("storefront_product_cards")
    .select(storefrontCardSelect())
    .in("product_id", uniqueIds)
    .limit(uniqueIds.length);
  if (error) {
    console.error("[storefront-catalog] Failed to load requested product cards.", error.message);
    return [];
  }

  const cardsById = new Map(((data ?? []) as StorefrontCardRow[]).map((row) => [row.id, toStorefrontCard(row)]));
  return uniqueIds.flatMap((id) => {
    const card = cardsById.get(id);
    return card ? [card] : [];
  });
}

export async function getStorefrontProductBySlug(slug: string): Promise<Product | undefined> {
  const admin = createAdminClient() as any;
  if (!admin) return undefined;

  const { data: cardRow, error: cardError } = await admin
    .from("storefront_product_cards")
    .select(storefrontCardSelect())
    .eq("slug", slug)
    .maybeSingle();
  if (cardError || !cardRow) return undefined;
  const card = toStorefrontCard(cardRow as StorefrontCardRow);

  const [{ data: row }, { data: variantRows }, { data: sourceRows }] = await Promise.all([
    admin
      .from("products")
      .select("id,slug,hooma_name,name_ka,short_description,short_description_ka,long_description,hero_image,gallery_images,video_url,tags,is_featured,price_placeholder,currency,base_price,sale_price,delivery_estimate,lead_time_business_days,estimated_print_minutes")
      .eq("id", card.id)
      .eq("status", "active")
      .eq("production_status", "approved")
      .maybeSingle(),
    admin
      .from("product_variants")
      .select("id,sku,size_label,layout_label,product_dimensions_cm,packing_dimensions_cm,gross_weight_kg,image,price,price_placeholder,available_colors,material,attributes,is_active")
      .eq("product_id", card.id)
      .eq("is_active", true),
    admin
      .from("product_sources")
      .select("platform,creator_name,license_status,source_url,commercial_use_allowed,media_use_allowed")
      .eq("product_id", card.id)
      .in("license_status", ["verified", "not_required"]),
  ]);
  if (!row) return undefined;

  const source = (sourceRows ?? []).find((candidate: any) => candidate.commercial_use_allowed === true
    && candidate.media_use_allowed === true
    && (candidate.platform === "hooma" || safeSourceUrl(candidate.source_url)));
  if (!source) return undefined;

  const heroImage = safeCatalogImage(row.hero_image, card.heroImage);
  const rawVariants = (variantRows ?? []).filter((variant: any) => Number(variant.price ?? row.sale_price ?? row.base_price) > 0);
  if (!rawVariants.length) return undefined;
  const variants: ProductVariant[] = rawVariants.map((variant: any) => {
    const material = typeof variant.material === "string" && variant.material ? variant.material : "PLA+";
    const availableColors = Array.isArray(variant.available_colors) && variant.available_colors.length ? variant.available_colors : ["სტანდარტული"];
    return {
      id: variant.id,
      sku: variant.sku,
      sizeLabel: variant.size_label || "Standard",
      layoutLabel: variant.layout_label || "Catalog",
      productDimensionsCm: dimensionLabel(variant.product_dimensions_cm),
      packingDimensionsCm: dimensionLabel(variant.packing_dimensions_cm),
      grossWeightKg: variant.gross_weight_kg === null ? "—" : String(variant.gross_weight_kg),
      image: safeCatalogImage(variant.image, heroImage),
      price: Number(variant.price ?? row.sale_price ?? row.base_price),
      pricePlaceholder: variant.price_placeholder || row.price_placeholder || "ფასი დამტკიცებულია",
      availableColors,
      availableMaterials: [material],
      ...variantColorProfile(variant.attributes),
    };
  });
  const galleryImages = Array.from(new Set<string>((Array.isArray(row.gallery_images) ? row.gallery_images : [])
    .map((image: unknown) => safeCatalogImage(image, heroImage))));
  const availableMaterials = Array.from(new Set(variants.flatMap((variant) => variant.availableMaterials)));
  const availableColors = Array.from(new Set(variants.flatMap((variant) => variant.availableColors)));

  return {
    id: row.id,
    slug: row.slug,
    hoomaName: row.hooma_name,
    nameKa: row.name_ka || row.hooma_name,
    category: card.category,
    categorySlug: card.categorySlug,
    subcategory: card.subcategory,
    subcategorySlug: card.subcategorySlug,
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
    price: card.price,
    pricePlaceholder: card.pricePlaceholder,
    currency: "GEL",
    deliveryEstimate: row.delivery_estimate || "3 სამუშაო დღე შეკვეთიდან მიწოდებამდე",
    leadTimeDays: card.leadTimeDays,
    estimatedPrintHours: row.estimated_print_minutes ? Number(row.estimated_print_minutes) / 60 : null,
    licenseStatus: source.license_status === "not_required" ? "not_required" : "verified",
    sourcePlatform: source.platform === "hooma" ? "hooma" : source.platform === "makerworld" ? "makerworld" : "external",
    sourceCreator: source.creator_name || undefined,
    isOrderable: true,
    ratingAverage: card.ratingAverage,
    ratingCount: card.ratingCount,
    reviewCount: card.ratingCount,
    salesCount: card.salesCount,
    popularityScore: card.popularityScore,
  };
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
    admin.from("storefront_product_cards").select("rating_average,rating_count,sales_count,popularity_score").eq("product_id", productId).limit(1),
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
    ratingAverage: Number(metrics?.rating_average ?? 0),
    ratingCount: Number(metrics?.rating_count ?? 0),
    reviewCount: Number(metrics?.rating_count ?? 0),
    salesCount: Number(metrics?.sales_count ?? 0),
    popularityScore: Number(metrics?.popularity_score ?? (row.is_featured ? 0.75 : 0)),
  };
}
