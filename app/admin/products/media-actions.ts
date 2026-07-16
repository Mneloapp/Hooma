"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type ProductMediaState = { ok: boolean; message: string };
type MediaKind = "image" | "video";
type RequestedMedia = { name?: string; size?: number; mimeType?: string; kind?: MediaKind };
type UploadedMedia = { path?: string; originalName?: string; size?: number; mimeType?: string; kind?: MediaKind };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const imageExtensions = new Set(["jpg", "jpeg", "png", "webp"]);
const videoExtensions = new Set(["mp4", "webm"]);
const allowedMimeTypes = new Set(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]);
const imageLimit = 10 * 1024 * 1024;
const videoLimit = 50 * 1024 * 1024;
const mediaRoles = new Set(["owner", "admin", "catalog_manager"]);

const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);
const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

async function mediaContext(productIdValue: unknown) {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  const productId = clean(productIdValue, 36);
  if (!profile || !admin || !mediaRoles.has(profile.role)) return { error: "პროდუქტის მედიის მართვის უფლება არ გაქვს." } as const;
  if (!uuidPattern.test(productId)) return { error: "პროდუქტის ID არასწორია." } as const;
  return { profile, admin, productId } as const;
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

function productMediaPath(value: unknown) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const prefix = "/storage/v1/object/public/product-media/";
    if (!url.pathname.startsWith(prefix)) return null;
    return decodeURIComponent(url.pathname.slice(prefix.length));
  } catch {
    return null;
  }
}

function parseStringArray(value: unknown, maximum: number) {
  try {
    const parsed = JSON.parse(String(value ?? "[]"));
    if (!Array.isArray(parsed) || parsed.length > maximum) return null;
    return parsed.map((item) => clean(item, 2_000)).filter(Boolean);
  } catch {
    return null;
  }
}

function refreshProductMedia(productId: string) {
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/deals");
  revalidatePath("/product/[slug]", "page");
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
}

export async function prepareProductMediaEditUploadAction(formData: FormData): Promise<{
  ok: boolean;
  message: string;
  requestId?: string;
  uploads?: Array<{ path: string; token: string }>;
}> {
  const context = await mediaContext(formData.get("product_id"));
  if ("error" in context) return { ok: false, message: context.error ?? "პროდუქტის მედიის მართვის უფლება არ გაქვს." };
  const { data: product } = await context.admin.from("products").select("id").eq("id", context.productId).maybeSingle();
  if (!product) return { ok: false, message: "პროდუქტი ვერ მოიძებნა." };

  let files: RequestedMedia[] = [];
  try { files = JSON.parse(String(formData.get("files") ?? "[]")); }
  catch { return { ok: false, message: "მედიის მონაცემები არასწორია." }; }
  if (!Array.isArray(files) || !files.length || files.length > 13 || files.some((file) => !validMediaDescriptor(file))) {
    return { ok: false, message: "აირჩიე სწორი ფოტო/ვიდეო. ფოტო მაქსიმუმ 10MB, ვიდეო მაქსიმუმ 50MB." };
  }
  if (files.filter((file) => file.kind === "image").length > 12 || files.filter((file) => file.kind === "video").length > 1) {
    return { ok: false, message: "პროდუქტზე მაქსიმუმ 12 ფოტო და 1 ვიდეო შეიძლება." };
  }

  const requestId = crypto.randomUUID();
  const paths = files.map((file) => `${context.profile.id}/${context.productId}/${requestId}/${crypto.randomUUID()}.${extensionOf(clean(file.name, 255))}`);
  const signed = await Promise.all(paths.map((path) => context.admin.storage.from("product-media").createSignedUploadUrl(path)));
  const failed = signed.find((result: any) => result.error || !result.data?.token);
  if (failed) return { ok: false, message: failed.error?.message ?? "მედიის უსაფრთხო ატვირთვა ვერ მომზადდა." };
  return {
    ok: true,
    message: "Upload prepared",
    requestId,
    uploads: signed.map((result: any, index: number) => ({ path: paths[index], token: result.data.token })),
  };
}

export async function discardProductMediaEditUploadsAction(formData: FormData) {
  const context = await mediaContext(formData.get("product_id"));
  if ("error" in context) return;
  const requestId = clean(formData.get("media_request_id"), 36);
  if (!uuidPattern.test(requestId)) return;
  let media: UploadedMedia[] = [];
  try { media = JSON.parse(String(formData.get("media_manifest") ?? "[]")); } catch { return; }
  if (!Array.isArray(media)) return;
  const prefix = `${context.profile.id}/${context.productId}/${requestId}/`;
  const paths = media.map((file) => clean(file.path, 600)).filter((path) => path.startsWith(prefix) && path.split("/").length === 4);
  if (paths.length) await context.admin.storage.from("product-media").remove(paths);
}

export async function updateProductMediaAction(formData: FormData): Promise<ProductMediaState> {
  const context = await mediaContext(formData.get("product_id"));
  if ("error" in context) return { ok: false, message: context.error ?? "პროდუქტის მედიის მართვის უფლება არ გაქვს." };
  const { data: product, error: productError } = await context.admin.from("products")
    .select("id,hero_image,gallery_images,video_url")
    .eq("id", context.productId)
    .maybeSingle();
  if (productError || !product) return { ok: false, message: "პროდუქტის არსებული მედია ვერ მოიძებნა." };

  const currentImages = Array.from(new Set<string>([
    ...(typeof product.hero_image === "string" && product.hero_image ? [product.hero_image] : []),
    ...(Array.isArray(product.gallery_images) ? product.gallery_images.filter((value: unknown): value is string => typeof value === "string" && Boolean(value)) : []),
  ]));
  const currentImageSet = new Set(currentImages);
  const retainedImages = parseStringArray(formData.get("retained_images"), 12);
  if (!retainedImages || retainedImages.some((url) => !currentImageSet.has(url)) || new Set(retainedImages).size !== retainedImages.length) {
    return { ok: false, message: "შენარჩუნებული ფოტოების სია არასწორია. განაახლე გვერდი და სცადე თავიდან." };
  }
  const retainedVideoValue = clean(formData.get("retained_video"), 2_000);
  const retainedVideo = retainedVideoValue || null;
  if (retainedVideo && retainedVideo !== product.video_url) return { ok: false, message: "შენარჩუნებული ვიდეო აღარ ემთხვევა პროდუქტს." };

  let uploaded: UploadedMedia[] = [];
  try { uploaded = JSON.parse(String(formData.get("media_manifest") ?? "[]")); }
  catch { return { ok: false, message: "ატვირთული მედიის მონაცემები არასწორია." }; }
  if (!Array.isArray(uploaded) || uploaded.length > 13 || uploaded.some((file) => !validMediaDescriptor(file))) {
    return { ok: false, message: "ატვირთული მედიის მონაცემები არასწორია." };
  }
  const uploadedImages = uploaded.filter((file) => file.kind === "image");
  const uploadedVideos = uploaded.filter((file) => file.kind === "video");
  if (uploadedVideos.length > 1 || (retainedVideo && uploadedVideos.length)) {
    return { ok: false, message: "პროდუქტზე მაქსიმუმ ერთი ვიდეო შეიძლება." };
  }

  const requestId = clean(formData.get("media_request_id"), 36);
  const paths: string[] = [];
  if (uploaded.length) {
    if (!uuidPattern.test(requestId)) return { ok: false, message: "მედიის ატვირთვის მოთხოვნა არასწორია." };
    const expectedPrefix = `${context.profile.id}/${context.productId}/${requestId}/`;
    for (const file of uploaded) {
      const path = clean(file.path, 600);
      if (!path.startsWith(expectedPrefix) || path.split("/").length !== 4) return { ok: false, message: "ატვირთული მედიის მისამართი არასწორია." };
      paths.push(path);
    }
    const { data: storedObjects, error: storageError } = await context.admin.storage
      .from("product-media")
      .list(`${context.profile.id}/${context.productId}/${requestId}`, { limit: 20 });
    if (storageError) return { ok: false, message: "ატვირთული მედიის შემოწმება ვერ მოხერხდა." };
    const storedByName = new Map<string, number>((storedObjects ?? []).map((item: any) => [item.name, Number(item.metadata?.size ?? 0)]));
    const invalidStoredFile = uploaded.some((file, index) => {
      const storedSize = storedByName.get(paths[index].split("/").pop()!);
      return storedSize === undefined || (storedSize > 0 && storedSize !== Number(file.size));
    });
    if (invalidStoredFile) return { ok: false, message: "ყველა ატვირთული ფოტო/ვიდეო ვერ დადასტურდა." };
  }

  const uploadedUrls = uploaded.map((file, index) => ({
    kind: file.kind,
    url: context.admin.storage.from("product-media").getPublicUrl(paths[index]).data.publicUrl as string,
  }));
  const finalImages = [
    ...retainedImages,
    ...uploadedUrls.filter((item) => item.kind === "image").map((item) => item.url),
  ];
  if (finalImages.length < 1 || finalImages.length > 12) {
    if (paths.length) await context.admin.storage.from("product-media").remove(paths);
    return { ok: false, message: "პროდუქტს მინიმუმ 1 და მაქსიმუმ 12 ფოტო სჭირდება." };
  }
  const heroIndex = Number(formData.get("hero_index"));
  if (!Number.isInteger(heroIndex) || heroIndex < 0 || heroIndex >= finalImages.length) {
    if (paths.length) await context.admin.storage.from("product-media").remove(paths);
    return { ok: false, message: "აირჩიე პროდუქტის მთავარი ფოტო." };
  }
  const finalVideo = uploadedUrls.find((item) => item.kind === "video")?.url ?? retainedVideo;
  const heroImage = finalImages[heroIndex];
  const orderedImages = [heroImage, ...finalImages.filter((_, index) => index !== heroIndex)];

  const { error: updateError } = await context.admin.from("products").update({
    hero_image: heroImage,
    gallery_images: orderedImages,
    video_url: finalVideo,
  }).eq("id", context.productId);
  if (updateError) {
    if (paths.length) await context.admin.storage.from("product-media").remove(paths);
    return { ok: false, message: "პროდუქტის მედია ვერ განახლდა." };
  }
  await context.admin.from("product_variants").update({ image: heroImage }).eq("product_id", context.productId);

  const removedUrls = [
    ...currentImages.filter((url) => !retainedImages.includes(url)),
    ...(product.video_url && product.video_url !== retainedVideo ? [product.video_url] : []),
  ];
  const removedPaths = Array.from(new Set(removedUrls.map(productMediaPath).filter((value): value is string => Boolean(value))));
  const removal = removedPaths.length ? await context.admin.storage.from("product-media").remove(removedPaths) : { error: null };
  await context.admin.from("audit_log").insert({
    actor_id: context.profile.id,
    action: "product_media_updated",
    entity_type: "product",
    entity_id: context.productId,
    metadata: {
      previous_image_count: currentImages.length,
      image_count: orderedImages.length,
      uploaded_image_count: uploadedImages.length,
      removed_image_count: currentImages.length - retainedImages.length,
      previous_video_present: Boolean(product.video_url),
      video_present: Boolean(finalVideo),
      storage_cleanup_failed: Boolean(removal.error),
    },
  });
  refreshProductMedia(context.productId);
  return {
    ok: true,
    message: removal.error ? "მედია განახლდა, თუმცა ძველი Storage ფაილის გასუფთავება ვერ დასრულდა." : "პროდუქტის ფოტოები და ვიდეო განახლებულია.",
  };
}
