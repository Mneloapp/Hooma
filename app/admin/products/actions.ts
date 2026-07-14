"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type DeleteProductState = { ok?: boolean; message?: string };
export type PublicationState = { ok?: boolean; message?: string };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function deleteError(message: string) {
  if (message.includes("referenced by an order")) return "პროდუქტი შეკვეთაში უკვე გამოიყენება და მისი წაშლა აღარ შეიძლება — გადაიყვანე Archived სტატუსში.";
  if (message.includes("deal history")) return "პროდუქტს დღის შეთავაზებების ისტორია აქვს და მისი წაშლა აღარ შეიძლება.";
  if (message.includes("Only Draft")) return "მხოლოდ Draft სტატუსის პროდუქტის წაშლა შეიძლება.";
  if (message.includes("not found")) return "პროდუქტი ვერ მოიძებნა ან უკვე წაშლილია.";
  return "პროდუქტის წაშლა ვერ დასრულდა. სცადე თავიდან.";
}

export async function deleteProductDraftAction(_state: DeleteProductState, formData: FormData): Promise<DeleteProductState> {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  const productId = String(formData.get("product_id") ?? "");
  if (!profile || !admin || !["owner", "admin"].includes(profile.role)) {
    return { ok: false, message: "Draft პროდუქტის წაშლა მხოლოდ Owner-ს ან Admin-ს შეუძლია." };
  }
  if (!uuidPattern.test(productId)) return { ok: false, message: "პროდუქტის ID არასწორია." };

  const { error } = await admin.rpc("delete_catalog_draft", {
    requested_product_id: productId,
    actor_profile_id: profile.id,
  });
  if (error) return { ok: false, message: deleteError(error.message) };

  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/deals");
  revalidatePath("/admin/products");
  revalidatePath("/admin/imports");
  return { ok: true, message: "Draft პროდუქტი წაიშალა." };
}

async function ownerCatalogContext(formData: FormData) {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  const productId = String(formData.get("product_id") ?? "");
  if (!profile || !admin || profile.role !== "owner") return { error: "ამ მოქმედებას მხოლოდ Owner ასრულებს." } as const;
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

export async function setProductProductionApprovalAction(_state: PublicationState, formData: FormData): Promise<PublicationState> {
  const context = await ownerCatalogContext(formData);
  if ("error" in context) return { ok: false, message: context.error };
  const approved = formData.get("approved") === "true";
  const { error } = await context.admin.rpc("set_catalog_production_approval", {
    requested_product_id: context.productId,
    requested_approved: approved,
    actor_profile_id: context.profile.id,
  });
  if (error) return { ok: false, message: error.message.includes("priced technical variant") ? "ჯერ საჭიროა ფასი, მასალა, წონა, დრო და ფირფიტების რაოდენობა." : "წარმოების გადაწყვეტილება ვერ შეინახა." };
  refreshCatalog(context.productId);
  return { ok: true, message: approved ? "წარმოება დამტკიცებულია." : "წარმოება შეჩერებულია." };
}

export async function setProductPublicationAction(_state: PublicationState, formData: FormData): Promise<PublicationState> {
  const context = await ownerCatalogContext(formData);
  if ("error" in context) return { ok: false, message: context.error };
  const publish = formData.get("publish") === "true";
  const { error } = await context.admin.rpc("set_catalog_publication", {
    requested_product_id: context.productId,
    requested_publish: publish,
    actor_profile_id: context.profile.id,
  });
  if (error) {
    const message = error.message.includes("Production approval")
      ? "ჯერ დაადასტურე წარმოების მზადყოფნა."
      : error.message.includes("commercial and media rights")
        ? "პროდუქტი საჯაროდ გამოსაქვეყნებლად ჯერ მზად არ არის."
        : error.message.includes("priced variant")
          ? "პროდუქტს აქტიური გასაყიდი ფასი სჭირდება."
          : "გამოქვეყნების გადაწყვეტილება ვერ შესრულდა.";
    return { ok: false, message };
  }
  refreshCatalog(context.productId);
  return { ok: true, message: publish ? "პროდუქტი გამოქვეყნებულია." : "პროდუქტი საჯარო კატალოგიდან მოიხსნა." };
}
