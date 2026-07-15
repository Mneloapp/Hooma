"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { productColorNames } from "@/data/product-colors";

export type HoomaProductState = { ok: boolean; message: string; productId?: string; sku?: string };
type MediaKind = "image" | "video";
type RequestedMedia = { name?: string; size?: number; mimeType?: string; kind?: MediaKind };
type UploadedMedia = { path?: string; originalName?: string; size?: number; mimeType?: string; kind?: MediaKind };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const videoExtensions = new Set(["mp4", "webm"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
const imageLimit = 10 * 1024 * 1024;
const videoLimit = 50 * 1024 * 1024;
const allowedProductColors = new Set<string>(productColorNames);

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

function positiveNumber(formData: FormData, key: string, max: number) {
  const value = Number(formData.get(key));
  if (!Number.isFinite(value) || value <= 0 || value > max) throw new Error(`${key} არასწორია.`);
  return value;
}

function safeSlug(name: string) {
  const base = name
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "hooma-product";
  return `${base}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

function validMediaDescriptor(file: RequestedMedia | UploadedMedia) {
  const name = clean((file as RequestedMedia).name ?? (file as UploadedMedia).originalName, 255);
  const extension = extensionOf(name);
  const size = Number(file.size);
  const kind = file.kind;
  const mimeType = clean(file.mimeType, 120);
  const extensionAllowed = kind === "image" ? imageExtensions.has(extension) : kind === "video" ? videoExtensions.has(extension) : false;
  const sizeAllowed = Number.isInteger(size) && size > 0 && size <= (kind === "image" ? imageLimit : videoLimit);
  return Boolean(name && extensionAllowed && sizeAllowed && allowedMimeTypes.has(mimeType));
}

function validateMediaSet(files: Array<RequestedMedia | UploadedMedia>) {
  const images = files.filter((file) => file.kind === "image");
  const videos = files.filter((file) => file.kind === "video");
  if (images.length < 1 || images.length > 12) return "ატვირთე მინიმუმ 1 და მაქსიმუმ 12 ფოტო.";
  if (videos.length > 1) return "პროდუქტზე მაქსიმუმ ერთი ვიდეო შეიძლება.";
  if (files.some((file) => !validMediaDescriptor(file))) return "ერთ-ერთი ფოტო ან ვიდეო არასწორი ფორმატისაა ან ზომის ლიმიტს აღემატება.";
  return null;
}

async function adminContext() {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !["owner", "admin"].includes(profile.role)) return null;
  return { profile, admin };
}

export async function prepareProductMediaUploadAction(formData: FormData): Promise<{
  ok: boolean;
  message: string;
  requestId?: string;
  uploads?: Array<{ path: string; token: string }>;
}> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "მედიის ატვირთვა მხოლოდ Admin-ს ან Owner-ს შეუძლია." };

  let files: RequestedMedia[] = [];
  try {
    files = JSON.parse(String(formData.get("files") ?? "[]"));
  } catch {
    return { ok: false, message: "მედიის მონაცემები არასწორია." };
  }
  if (!Array.isArray(files)) return { ok: false, message: "მედიის მონაცემები არასწორია." };
  const mediaError = validateMediaSet(files);
  if (mediaError) return { ok: false, message: mediaError };

  const requestId = crypto.randomUUID();
  const paths = files.map((file) => `${context.profile.id}/${requestId}/${crypto.randomUUID()}.${extensionOf(clean(file.name, 255))}`);
  const signed = await Promise.all(paths.map((path) => context.admin.storage.from("product-media").createSignedUploadUrl(path)));
  const failed = signed.find((result: any) => result.error || !result.data?.token);
  if (failed) return { ok: false, message: failed.error?.message ?? "მედიის უსაფრთხო ატვირთვა ვერ მომზადდა. გაუშვი ბოლო Supabase migration." };

  return {
    ok: true,
    message: "Upload prepared",
    requestId,
    uploads: signed.map((result: any, index: number) => ({ path: paths[index], token: result.data.token })),
  };
}

export async function createHoomaProductAction(formData: FormData): Promise<HoomaProductState> {
  const context = await adminContext();
  if (!context) return { ok: false, message: "პროდუქტის დამატება მხოლოდ Admin-ს ან Owner-ს შეუძლია." };

  const categoryId = clean(formData.get("category_id"), 36);
  const materialId = clean(formData.get("material_profile_id"), 36);
  const pricingId = clean(formData.get("pricing_profile_id"), 36);
  if (![categoryId, materialId, pricingId].every((value) => uuidPattern.test(value))) {
    return { ok: false, message: "კატეგორია, მასალა ან ფასის პროფილი არასწორია." };
  }

  const name = clean(formData.get("name"), 160);
  const description = clean(formData.get("description"), 3_000);
  const operatorReference = clean(formData.get("operator_reference"), 2_000);
  const selectedColors = Array.from(new Set(formData.getAll("colors").map((color) => clean(color, 60)).filter(Boolean)));
  if (name.length < 2) return { ok: false, message: "შეიყვანე პროდუქტის სახელი." };
  if (description.length < 10) return { ok: false, message: "აღწერა მინიმუმ 10 სიმბოლოს უნდა შეიცავდეს." };
  if (operatorReference.length < 3) return { ok: false, message: "შეავსე ოპერატორის რეფერენსი." };
  if (selectedColors.length < 1 || selectedColors.length > productColorNames.length || selectedColors.some((color) => !allowedProductColors.has(color))) {
    return { ok: false, message: "აირჩიე მინიმუმ ერთი სწორი ფერი." };
  }

  const requestId = clean(formData.get("media_request_id"), 36);
  let media: UploadedMedia[] = [];
  try {
    media = JSON.parse(String(formData.get("media_manifest") ?? "[]"));
  } catch {
    return { ok: false, message: "ატვირთული მედიის მონაცემები არასწორია." };
  }
  if (!uuidPattern.test(requestId) || !Array.isArray(media)) return { ok: false, message: "ატვირთული მედიის მოთხოვნა არასწორია." };
  const mediaError = validateMediaSet(media);
  if (mediaError) return { ok: false, message: mediaError };

  const expectedPrefix = `${context.profile.id}/${requestId}/`;
  const paths = media.map((file) => clean(file.path, 500));
  if (paths.some((path) => !path.startsWith(expectedPrefix) || path.split("/").length !== 3)) {
    return { ok: false, message: "ატვირთული მედიის მისამართი არასწორია." };
  }

  const { data: storedObjects, error: storageError } = await context.admin.storage
    .from("product-media")
    .list(`${context.profile.id}/${requestId}`, { limit: 20 });
  if (storageError) return { ok: false, message: "ატვირთული მედიის შემოწმება ვერ მოხერხდა." };
  const storedByName = new Map<string, number>((storedObjects ?? []).map((item: any) => [item.name, Number(item.metadata?.size ?? 0)]));
  if (media.some((file, index) => {
    const storedSize = storedByName.get(paths[index].split("/").pop()!);
    return storedSize === undefined || (storedSize > 0 && storedSize !== Number(file.size));
  })) return { ok: false, message: "ყველა ატვირთული ფოტო/ვიდეო ვერ დადასტურდა." };

  try {
    const grams = positiveNumber(formData, "material_grams", 1_000_000);
    const hours = Number(formData.get("print_hours"));
    const remainingMinutes = Number(formData.get("print_minutes"));
    if (!Number.isInteger(hours) || hours < 0 || hours > 16_666 || !Number.isInteger(remainingMinutes) || remainingMinutes < 0 || remainingMinutes > 59) {
      throw new Error("ბეჭდვის დრო არასწორია.");
    }
    const totalMinutes = hours * 60 + remainingMinutes;
    if (totalMinutes < 1) throw new Error("ბეჭდვის დრო მინიმუმ 1 წუთი უნდა იყოს.");
    const margin = Number(formData.get("margin_percent"));
    if (!Number.isFinite(margin) || margin < 0 || margin >= 100) throw new Error("მარჟა უნდა იყოს 0-დან 99.99%-მდე.");
    const dimensions = {
      x: positiveNumber(formData, "dimension_x", 100_000),
      y: positiveNumber(formData, "dimension_y", 100_000),
      z: positiveNumber(formData, "dimension_z", 100_000),
      unit: "mm",
    };

    const publicUrls = media.map((file, index) => ({
      kind: file.kind,
      url: context.admin.storage.from("product-media").getPublicUrl(paths[index]).data.publicUrl,
    }));
    const imageUrls = publicUrls.filter((item) => item.kind === "image").map((item) => item.url);
    const videoUrl = publicUrls.find((item) => item.kind === "video")?.url ?? null;
    const { data, error } = await context.admin.rpc("create_manual_product_draft_v2", {
      actor_profile_id: context.profile.id,
      product_name: name,
      product_slug: safeSlug(name),
      product_description: description,
      selected_category_id: categoryId,
      selected_material_profile_id: materialId,
      selected_pricing_profile_id: pricingId,
      selected_material_grams: grams,
      selected_print_minutes: totalMinutes,
      selected_margin_percent: margin,
      selected_dimensions: dimensions,
      product_image_urls: imageUrls,
      product_video_url: videoUrl,
      operator_reference: operatorReference,
      product_available_colors: selectedColors,
    });
    if (error || !data?.id) {
      await context.admin.storage.from("product-media").remove(paths);
      const message = error?.message ?? "Product Draft ვერ შეიქმნა.";
      if (message.includes("Active category and material")) return { ok: false, message: "არჩეული კატეგორია ან მასალა აღარ არის აქტიური." };
      if (message.includes("function") || message.includes("schema cache")) return { ok: false, message: "გაუშვი ბოლო Supabase migration და სცადე თავიდან." };
      return { ok: false, message: "პროდუქტის Draft ვერ შეიქმნა. გადაამოწმე მონაცემები." };
    }

    revalidatePath("/");
    revalidatePath("/shop");
    revalidatePath("/admin/products");
    revalidatePath("/admin/products/new");
    return { ok: true, productId: String(data.id), sku: String(data.sku), message: `Draft შეიქმნა · SKU ${data.sku}` };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "ტექნიკური მონაცემები არასწორია." };
  }
}
