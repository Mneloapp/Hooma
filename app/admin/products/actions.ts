"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type DeleteProductState = { ok?: boolean; message?: string };
export type BulkDeleteProductState = { ok?: boolean; message?: string; deletedCount?: number };
export type PublicationState = {
  ok?: boolean;
  message?: string;
  completedPublication?: boolean;
  nextDraftId?: string | null;
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deleteError(message: string) {
  if (message.includes("active live order")) return "Archived პროდუქტს აქტიური რეალური შეკვეთა უკავშირდება და მის დასრულებამდე ან გაუქმებამდე ვერ წაიშლება.";
  if (message.includes("deal history and must be archived")) return "პროდუქტს დღის შეთავაზებების ისტორია აქვს. უსაფრთხო წაშლამდე ჯერ გადაიყვანე Archived სტატუსში.";
  if (message.includes("must be archived")) return "პროდუქტი შეკვეთაშია გამოყენებული. უსაფრთხო წაშლამდე ჯერ გადაიყვანე Archived სტატუსში.";
  if (message.includes("snapshot is incomplete")) return "შეკვეთის ისტორიულ ჩანაწერში პროდუქტის snapshot არასრულია და უსაფრთხო წაშლა ვერ შესრულდება.";
  if (message.includes("referenced by an order")) return "პროდუქტი შეკვეთის ისტორიასთანაა დაკავშირებული და უსაფრთხო წაშლა ვერ შესრულდა.";
  if (message.includes("deal history")) return "დღის შეთავაზებების ისტორიის უსაფრთხო გასუფთავება ვერ შესრულდა.";
  if (message.includes("Only Draft")) return "მხოლოდ Draft სტატუსის პროდუქტის წაშლა შეიძლება.";
  if (message.includes("Some requested products")) return "ერთ-ერთი მონიშნული პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია. განაახლე გვერდი და სცადე თავიდან.";
  if (message.includes("not found")) return "პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია.";
  if (message.includes("Between 1 and 100")) return "ერთ ოპერაციაში მონიშნე 1-დან 100-მდე პროდუქტი.";
  if (message.includes("Owner, Admin, or Catalog Manager")) return "პროდუქტის წაშლა მხოლოდ Owner-ს, Admin-ს ან კატალოგის მენეჯერს შეუძლია.";
  if (message.includes("delete_catalog_products_v2") || message.includes("schema cache")) return "გაუშვი ბოლო Supabase migration და სცადე თავიდან.";
  return "პროდუქტის წაშლა ვერ დასრულდა. სცადე თავიდან.";
}

const deletionRoles = ["owner", "admin", "catalog_manager"];

async function deleteCatalogProducts(productIds: string[]) {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !deletionRoles.includes(profile.role)) {
    return { ok: false, message: "პროდუქტის წაშლა მხოლოდ Owner-ს, Admin-ს ან კატალოგის მენეჯერს შეუძლია." } as const;
  }
  const uniqueIds = Array.from(new Set(productIds));
  if (!uniqueIds.length || uniqueIds.length > 100 || uniqueIds.some((id) => !uuidPattern.test(id))) {
    return { ok: false, message: "მონიშნული პროდუქტების სია არასწორია." } as const;
  }

  const { data: productMedia, error: mediaReadError } = await admin.from("products").select("id,hero_image,gallery_images,video_url").in("id", uniqueIds);
  if (mediaReadError) return { ok: false, message: "პროდუქტების მედიის შემოწმება ვერ მოხერხდა." } as const;
  const { data, error } = await admin.rpc("delete_catalog_products_v2", {
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
  const deletedCount = Number(data?.deleted_count ?? uniqueIds.length);
  const removedDailyDealCount = Number(data?.removed_daily_deal_count ?? 0);
  const dealMessage = removedDailyDealCount ? ` Daily Deals-ის ${removedDailyDealCount} კავშირი გასუფთავდა.` : "";
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
