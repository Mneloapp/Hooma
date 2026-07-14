"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

export type DeleteProductState = { ok?: boolean; message?: string };
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
