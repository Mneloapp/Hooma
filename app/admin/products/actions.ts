"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";
import { productColorNames } from "@/data/product-colors";
import { revalidateStorefrontCatalog } from "@/lib/storefront-cache";

export type DeleteProductState = { ok?: boolean; message?: string };
export type BulkDeleteProductState = { ok?: boolean; message?: string; deletedCount?: number };
export type BulkPublicationFailure = { productId: string; name: string; message: string };
export type BulkPublicationState = {
  ok?: boolean;
  completed?: boolean;
  message?: string;
  publishedCount?: number;
  skippedCount?: number;
  failures?: BulkPublicationFailure[];
};
export type PublicationState = {
  ok?: boolean;
  message?: string;
  completedPublication?: boolean;
  nextDraftId?: string | null;
};
export type DraftProductUpdateState = { ok?: boolean; message?: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const allowedProductColors = new Set<string>(productColorNames);
const clean = (value: unknown, max: number) => String(value ?? "").trim().slice(0, max);

function deleteError(message: string) {
  if (message.includes("active live order")) return "Archived პროდუქტს აქტიური რეალური შეკვეთა უკავშირდება და მის დასრულებამდე ან გაუქმებამდე ვერ წაიშლება.";
  if (message.includes("deal history and must be archived")) return "გაუშვი ბოლო Supabase migration — შემდეგ Daily Deals-ში არსებული პროდუქტი Archived სტატუსის გარეშე წაიშლება და ავტომატურად ჩანაცვლდება.";
  if (message.includes("must be archived")) return "პროდუქტი შეკვეთაშია გამოყენებული. უსაფრთხო წაშლამდე ჯერ გადაიყვანე Archived სტატუსში.";
  if (message.includes("snapshot is incomplete")) return "შეკვეთის ისტორიულ ჩანაწერში პროდუქტის snapshot არასრულია და უსაფრთხო წაშლა ვერ შესრულდება.";
  if (message.includes("referenced by an order")) return "პროდუქტი შეკვეთის ისტორიასთანაა დაკავშირებული და უსაფრთხო წაშლა ვერ შესრულდა.";
  if (message.includes("deal history")) return "დღის შეთავაზებების ისტორიის უსაფრთხო გასუფთავება ვერ შესრულდა.";
  if (message.includes("Only Draft")) return "მხოლოდ Draft სტატუსის პროდუქტის წაშლა შეიძლება.";
  if (message.includes("Some requested products")) return "ერთ-ერთი მონიშნული პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია. განაახლე გვერდი და სცადე თავიდან.";
  if (message.includes("delete_catalog_products_v2") || message.includes("delete_catalog_product_from_audit_v1") || message.includes("schema cache")) return "გაუშვი ბოლო Supabase migration და სცადე თავიდან.";
  if (message.includes("no longer available for deletion")) return "აუდიტის ეს შედეგი უკვე დამუშავდა. განაახლე გვერდი.";
  if (message.includes("not found")) return "პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია.";
  if (message.includes("Between 1 and 100")) return "ერთ ოპერაციაში მონიშნე 1-დან 100-მდე პროდუქტი.";
  if (message.includes("Owner, Admin, or Catalog Manager")) return "პროდუქტის წაშლა მხოლოდ Owner-ს, Admin-ს ან კატალოგის მენეჯერს შეუძლია.";
  return "პროდუქტის წაშლა ვერ დასრულდა. სცადე თავიდან.";
}

const deletionRoles = ["owner", "admin", "catalog_manager"];
const publicationRoles = ["owner", "admin"];

function publicationError(message: string) {
  if (message.includes("Product source was not found")) return "პროდუქტს წყაროს რეფერენსი არ აქვს.";
  if (message.includes("rejected")) return "პროდუქტის წყარო უარყოფილ სტატუსშია.";
  if (message.includes("priced technical variant") || message.includes("priced variant")) return "ფასი ან ტექნიკური მონაცემები შესავსებია.";
  if (message.includes("explicit confirmation")) return "გამოქვეყნების დადასტურება აკლია.";
  if (message.includes("Product was not found")) return "პროდუქტი ვერ მოიძებნა.";
  if (message.includes("Only Draft")) return "მხოლოდ Draft პროდუქტის ჯგუფურად გამოქვეყნება შეიძლება.";
  return "გამოქვეყნება ვერ დასრულდა.";
}

export async function deleteCatalogProducts(productIds: string[], options: { auditItemId?: string } = {}) {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !deletionRoles.includes(profile.role)) {
    return { ok: false, message: "პროდუქტის წაშლა მხოლოდ Owner-ს, Admin-ს ან კატალოგის მენეჯერს შეუძლია." } as const;
  }
  const uniqueIds = Array.from(new Set(productIds));
  if (!uniqueIds.length || uniqueIds.length > 100 || uniqueIds.some((id) => !uuidPattern.test(id))) {
    return { ok: false, message: "მონიშნული პროდუქტების სია არასწორია." } as const;
  }
  const auditItemId = options.auditItemId;
  if (auditItemId && (!uuidPattern.test(auditItemId) || uniqueIds.length !== 1)) {
    return { ok: false, message: "აუდიტის ჩანაწერი არასწორია." } as const;
  }

  if (auditItemId) {
    const { data: auditItem, error: auditItemError } = await admin.from("catalog_product_audit_items")
      .select("product_id,status,review_visible")
      .eq("id", auditItemId)
      .maybeSingle();
    if (auditItemError || auditItem?.product_id !== uniqueIds[0]) {
      return { ok: false, message: "პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია." } as const;
    }
    if (auditItem.review_visible !== true || !["ready", "failed"].includes(auditItem.status)) {
      return { ok: false, message: "აუდიტის ეს შედეგი უკვე დამუშავდა. განაახლე გვერდი." } as const;
    }
  }

  const { data: productMedia, error: mediaReadError } = await admin.from("products").select("id,hero_image,gallery_images,video_url").in("id", uniqueIds);
  if (mediaReadError) return { ok: false, message: "პროდუქტების მედიის შემოწმება ვერ მოხერხდა." } as const;
  const { data, error } = auditItemId
    ? await admin.rpc("delete_catalog_product_from_audit_v1", {
      actor_profile_id: profile.id,
      requested_item_id: auditItemId,
    })
    : await admin.rpc("delete_catalog_products_v2", {
      requested_product_ids: uniqueIds,
      actor_profile_id: profile.id,
    });
  if (error) return { ok: false, message: deleteError(error.message) } as const;

  const mediaPaths = Array.from(new Set((productMedia ?? []).flatMap((product: any) => [
    productMediaPath(product.hero_image),
    ...(Array.isArray(product.gallery_images) ? product.gallery_images.map(productMediaPath) : []),
    productMediaPath(product.video_url),
  ]).filter((path: unknown): path is string => typeof path === "string" && Boolean(path))));
  const storageResult = mediaPaths.length ? await admin.storage.from("product-media").remove(mediaPaths) : { error: null };

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/deals");
  revalidatePath("/product/[slug]", "page");
  revalidatePath("/admin/products");
  revalidatePath("/admin/imports");
  revalidatePath("/admin/catalog-agent");
  revalidateStorefrontCatalog();
  const deletedCount = Number(data?.deleted_count ?? uniqueIds.length);
  const removedDailyDealCount = Number(data?.removed_daily_deal_count ?? 0);
  const removedCurrentDailyDealCount = Number(data?.removed_current_daily_deal_count ?? 0);
  const refilledCurrentDailyDealCount = Number(data?.refilled_current_daily_deal_count ?? 0);
  const currentDailyDealCount = Number(data?.current_daily_deal_count ?? 0);
  const dealMessages: string[] = [];
  if (removedDailyDealCount) dealMessages.push(`Daily Deals-ის ${removedDailyDealCount} კავშირი გასუფთავდა.`);
  if (removedCurrentDailyDealCount || refilledCurrentDailyDealCount) {
    dealMessages.push(`დღევანდელ სიაში დაემატა ${refilledCurrentDailyDealCount} შემცვლელი და ახლა ${currentDailyDealCount}/50 პროდუქტია.`);
  }
  const dealMessage = dealMessages.length ? ` ${dealMessages.join(" ")}` : "";
  return {
    ok: true,
    deletedCount,
    message: storageResult.error
      ? `${deletedCount} პროდუქტი წაიშალა.${dealMessage} თუმცა მედიის ნაწილის გასუფთავება ვერ დასრულდა.`
      : `${deletedCount} პროდუქტი წარმატებით წაიშალა.${dealMessage}`,
  } as const;
}

export async function deleteCatalogProductsAction(_state: BulkDeleteProductState, formData: FormData): Promise<BulkDeleteProductState> {
  return deleteCatalogProducts(formData.getAll("product_ids").map(String));
}

async function publishProductsIndividually(admin: any, productIds: string[], actorProfileId: string) {
  const failures: Array<{ product_id: string; error: string }> = [];
  let publishedCount = 0;
  for (let offset = 0; offset < productIds.length; offset += 8) {
    const batch = productIds.slice(offset, offset + 8);
    const results = await Promise.all(batch.map(async (productId) => {
      const { error } = await admin.rpc("confirm_and_publish_catalog_product", {
        requested_product_id: productId,
        actor_profile_id: actorProfileId,
        confirmed_publication_authority: true,
      });
      return { productId, error };
    }));
    for (const result of results) {
      if (result.error) failures.push({ product_id: result.productId, error: result.error.message });
      else publishedCount += 1;
    }
  }
  return { published_count: publishedCount, failures };
}

export async function bulkPublishCatalogProductsAction(
  _state: BulkPublicationState,
  formData: FormData,
): Promise<BulkPublicationState> {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !publicationRoles.includes(profile.role)) {
    return { ok: false, completed: true, message: "პროდუქტების გამოქვეყნება მხოლოდ Owner-ს ან Admin-ს შეუძლია." };
  }
  if (formData.get("confirm_bulk_publication") !== "true") {
    return { ok: false, completed: true, message: "ჯგუფური გამოქვეყნება დაადასტურე და სცადე თავიდან." };
  }

  const requestedIds = Array.from(new Set(formData.getAll("product_ids").map(String)));
  if (!requestedIds.length || requestedIds.length > 1_000 || requestedIds.some((id) => !uuidPattern.test(id))) {
    return { ok: false, completed: true, message: "ერთ ოპერაციაში მონიშნე 1-დან 1000-მდე პროდუქტი." };
  }

  const products: Array<{ id: string; status: string; name_ka: string | null; hooma_name: string | null }> = [];
  for (let offset = 0; offset < requestedIds.length; offset += 100) {
    const { data: rows, error: readError } = await admin
      .from("products")
      .select("id,status,name_ka,hooma_name")
      .in("id", requestedIds.slice(offset, offset + 100));
    if (readError) return { ok: false, completed: true, message: "მონიშნული პროდუქტების წაკითხვა ვერ მოხერხდა." };
    products.push(...((rows ?? []) as typeof products));
  }
  const names = new Map(products.map((product) => [product.id, product.name_ka || product.hooma_name || product.id]));
  const draftIds = products.filter((product) => product.status === "draft").map((product) => product.id);
  const skippedCount = requestedIds.length - draftIds.length;
  if (!draftIds.length) {
    return {
      ok: true,
      completed: true,
      publishedCount: 0,
      skippedCount,
      failures: [],
      message: "მონიშნულ პროდუქტებში გამოსაქვეყნებელი Draft არ არის.",
    };
  }

  let result: any;
  const { data, error } = await admin.rpc("bulk_confirm_and_publish_catalog_products", {
    requested_product_ids: draftIds,
    actor_profile_id: profile.id,
    confirmed_publication_authority: true,
  });
  if (error && (error.code === "PGRST202" || error.message.includes("schema cache") || error.message.includes("bulk_confirm_and_publish_catalog_products"))) {
    result = await publishProductsIndividually(admin, draftIds, profile.id);
  } else if (error) {
    return { ok: false, completed: true, message: "ჯგუფური გამოქვეყნება ვერ დასრულდა." };
  } else {
    result = data ?? {};
  }

  const failures: BulkPublicationFailure[] = (Array.isArray(result.failures) ? result.failures : []).map((failure: any) => ({
    productId: String(failure.product_id ?? ""),
    name: names.get(String(failure.product_id ?? "")) ?? "უცნობი პროდუქტი",
    message: publicationError(String(failure.error ?? "")),
  }));
  const publishedCount = Number(result.published_count ?? Math.max(0, draftIds.length - failures.length));

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/deals");
  revalidatePath("/product/[slug]", "page");
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/admin/products");
  for (const productId of draftIds) revalidatePath(`/admin/products/${productId}`);
  revalidateStorefrontCatalog();

  const failureMessage = failures.length ? ` ${failures.length} პროდუქტს მონაცემების გასწორება სჭირდება.` : "";
  const skippedMessage = skippedCount ? ` ${skippedCount} უკვე გამოქვეყნებული/არასამუშაო სტატუსის პროდუქტი გამოტოვებულია.` : "";
  return {
    ok: publishedCount > 0 || failures.length === 0,
    completed: true,
    publishedCount,
    skippedCount,
    failures,
    message: `${publishedCount} პროდუქტი გამოქვეყნდა.${failureMessage}${skippedMessage}`,
  };
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

export async function deleteProductDraftAction(_state: DeleteProductState, formData: FormData): Promise<DeleteProductState> {
  const productId = String(formData.get("product_id") ?? "");
  if (!uuidPattern.test(productId)) return { ok: false, message: "პროდუქტის ID არასწორია." };
  const result = await deleteCatalogProducts([productId]);
  if (!result.ok) return { ok: false, message: result.message };

  const admin = createAdminClient() as any;
  const { data: nextDraft } = admin
    ? await admin.from("products").select("id").eq("status", "draft").order("created_at", { ascending: true }).limit(1).maybeSingle()
    : { data: null };
  redirect(nextDraft?.id ? `/admin/products/${nextDraft.id}` : "/admin/products");
}

async function catalogAdminContext(formData: FormData) {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  const productId = String(formData.get("product_id") ?? "");
  if (!profile || !admin || !["owner", "admin"].includes(profile.role)) return { error: "ამ მოქმედებას მხოლოდ Admin ან Owner ასრულებს." } as const;
  if (!uuidPattern.test(productId)) return { error: "პროდუქტის ID არასწორია." } as const;
  return { profile, admin, productId } as const;
}

function refreshCatalog(productId: string) {
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/deals");
  revalidatePath("/product/[slug]", "page");
  revalidatePath("/products/[slug]", "page");
  revalidatePath("/admin/products");
  revalidatePath(`/admin/products/${productId}`);
  revalidateStorefrontCatalog();
}

export async function updateProductDraftAction(
  _state: DraftProductUpdateState,
  formData: FormData,
): Promise<DraftProductUpdateState> {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !["owner", "admin", "catalog_manager"].includes(profile.role)) {
    return { ok: false, message: "Draft-ის რედაქტირება მხოლოდ კატალოგის მართვის უფლების მქონე თანამშრომელს შეუძლია." };
  }

  const productId = clean(formData.get("product_id"), 36);
  const categoryId = clean(formData.get("category_id"), 36);
  const materialId = clean(formData.get("material_profile_id"), 36);
  const pricingId = clean(formData.get("pricing_profile_id"), 36);
  if (![productId, categoryId, materialId, pricingId].every((value) => uuidPattern.test(value))) {
    return { ok: false, message: "პროდუქტი, კატეგორია ან ფასის პროფილი არასწორია." };
  }

  const name = clean(formData.get("name"), 160);
  const description = clean(formData.get("description"), 3_000);
  const operatorReference = clean(formData.get("operator_reference"), 2_000);
  const colorMode = clean(formData.get("color_mode"), 32);
  const colors = Array.from(new Set(formData.getAll("colors").map((value) => clean(value, 60)).filter(Boolean)));
  const grams = Number(formData.get("material_grams"));
  const hours = Number(formData.get("print_hours"));
  const minutes = Number(formData.get("print_minutes"));
  const margin = Number(formData.get("margin_percent"));
  const totalMinutes = hours * 60 + minutes;

  if (name.length < 2) return { ok: false, message: "სახელი მინიმუმ 2 სიმბოლოს უნდა შეიცავდეს." };
  if (description.length < 10) return { ok: false, message: "აღწერა მინიმუმ 10 სიმბოლოს უნდა შეიცავდეს." };
  if (operatorReference.length < 3) return { ok: false, message: "შეავსე ოპერატორის რეფერენსი." };
  if (!Number.isFinite(grams) || grams <= 0 || grams > 1_000_000) return { ok: false, message: "წონა არასწორია." };
  if (!Number.isInteger(hours) || hours < 0 || hours > 16_666 || !Number.isInteger(minutes) || minutes < 0 || minutes > 59 || totalMinutes < 1) {
    return { ok: false, message: "ბეჭდვის დრო არასწორია." };
  }
  if (!Number.isFinite(margin) || margin < 0 || margin >= 100) return { ok: false, message: "მარჟა უნდა იყოს 0-დან 99.99%-მდე." };
  if (!["customer_choice", "fixed_multicolor"].includes(colorMode)) return { ok: false, message: "ფერის რეჟიმი არასწორია." };
  if (colors.some((color) => !allowedProductColors.has(color)) || colors.length < (colorMode === "fixed_multicolor" ? 2 : 1)) {
    return { ok: false, message: colorMode === "fixed_multicolor" ? "AMS პროდუქტისთვის აირჩიე მინიმუმ ორი ფერი." : "აირჩიე მინიმუმ ერთი ფერი." };
  }

  const { data, error } = await admin.rpc("update_catalog_product_v2", {
    actor_profile_id: profile.id,
    requested_product_id: productId,
    product_name: name,
    product_description: description,
    selected_category_id: categoryId,
    selected_material_profile_id: materialId,
    selected_pricing_profile_id: pricingId,
    selected_material_grams: grams,
    selected_print_minutes: totalMinutes,
    selected_margin_percent: margin,
    operator_reference: operatorReference,
    product_available_colors: colors,
    product_color_mode: colorMode,
  });
  if (error) {
    const message = error.message.includes("Product status cannot be edited")
      ? "ამ სტატუსის პროდუქტის რედაქტირება შეუძლებელია."
      : error.message.includes("function") || error.message.includes("schema cache")
        ? "ჯერ გაუშვი Product editor migration."
        : "Draft-ის მონაცემების შენახვა ვერ დასრულდა.";
    return { ok: false, message };
  }

  refreshCatalog(productId);
  return {
    ok: true,
    message: `პროდუქტი განახლდა · თვითღირებულება ₾${Number(data?.production_cost ?? 0).toFixed(2)} · გასაყიდი ფასი ₾${Number(data?.final_sale_price ?? 0).toFixed(2)}`,
  };
}

async function findNextDraftId(admin: any, currentProductId: string) {
  const { data } = await admin
    .from("products")
    .select("id")
    .eq("status", "draft")
    .neq("id", currentProductId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return typeof data?.id === "string" ? data.id : null;
}

export async function setProductPublicationAction(_state: PublicationState, formData: FormData): Promise<PublicationState> {
  const context = await catalogAdminContext(formData);
  if ("error" in context) return { ok: false, message: context.error };
  const publish = formData.get("publish") === "true";
  const confirmPublicationReview = formData.get("confirm_publication_review") === "true";
  if (publish && confirmPublicationReview) {
    const { error: reviewError } = await context.admin.rpc("confirm_and_publish_catalog_product", {
      requested_product_id: context.productId,
      actor_profile_id: context.profile.id,
      confirmed_publication_authority: true,
    });
    if (reviewError) {
      const message = reviewError.message.includes("schema cache") || reviewError.message.includes("confirm_and_publish_catalog_product")
        ? "ჯერ გაუშვი Catalog publication confirmation migration."
        : reviewError.message.includes("explicit confirmation")
          ? "გამოქვეყნებამდე მონიშნე Admin-ის დადასტურება."
          : reviewError.message.includes("rejected")
            ? "უარყოფილი წყაროს publication confirmation-ით გამოქვეყნება შეუძლებელია."
            : reviewError.message.includes("priced technical variant") || reviewError.message.includes("priced variant")
              ? "პროდუქტს ფასი და შევსებული ტექნიკური მონაცემები სჭირდება."
          : "Admin-ის publication confirmation ვერ შეინახა.";
      return { ok: false, message };
    }
    refreshCatalog(context.productId);
    return {
      ok: true,
      message: "დადასტურება შენახულია და პროდუქტი გამოქვეყნებულია.",
      completedPublication: true,
      nextDraftId: await findNextDraftId(context.admin, context.productId),
    };
  }
  const { error } = await context.admin.rpc("set_catalog_publication", {
    requested_product_id: context.productId,
    requested_publish: publish,
    actor_profile_id: context.profile.id,
  });
  if (error) {
    const message = error.message.includes("commercial and media rights")
        ? "მონიშნე Admin publication confirmation და სცადე თავიდან."
        : error.message.includes("priced technical variant") || error.message.includes("priced variant")
          ? "პროდუქტს ფასი და შევსებული ტექნიკური მონაცემები სჭირდება."
          : "გამოქვეყნების გადაწყვეტილება ვერ შესრულდა.";
    return { ok: false, message };
  }
  refreshCatalog(context.productId);
  return publish
    ? {
        ok: true,
        message: "პროდუქტი გამოქვეყნებულია.",
        completedPublication: true,
        nextDraftId: await findNextDraftId(context.admin, context.productId),
      }
    : { ok: true, message: "პროდუქტი საჯარო კატალოგიდან მოიხსნა." };
}
