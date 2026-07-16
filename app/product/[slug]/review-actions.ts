"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type ProductReviewActionResult = { ok: boolean; message: string };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const safeSlug = (value: unknown) => String(value ?? "").trim().replace(/[^a-z0-9-]/g, "").slice(0, 120);

function refreshReviewPages(slug: string) {
  revalidatePath(`/product/${slug}`);
  revalidatePath("/product/[slug]", "page");
  revalidatePath("/");
  revalidatePath("/shop");
}

export async function submitProductReviewAction(formData: FormData): Promise<ProductReviewActionResult> {
  const supabase = (await createClient()) as any;
  if (!supabase) return { ok: false, message: "Supabase ჯერ არ არის დაკავშირებული." };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "შეფასებისთვის ჯერ ანგარიშში შედი." };

  const productId = String(formData.get("product_id") ?? "");
  const orderItemId = String(formData.get("order_item_id") ?? "");
  const slug = safeSlug(formData.get("slug"));
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();
  if (!uuidPattern.test(productId) || !uuidPattern.test(orderItemId) || !slug) {
    return { ok: false, message: "პროდუქტის ან შეკვეთის მონაცემი არასწორია." };
  }
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, message: "აირჩიე შეფასება 1-დან 5 ვარსკვლავამდე." };
  if (comment.length < 3 || comment.length > 2000) return { ok: false, message: "კომენტარი უნდა შეიცავდეს 3-დან 2000 სიმბოლომდე." };

  const { error } = await supabase.rpc("submit_my_product_review", {
    requested_product_id: productId,
    requested_order_item_id: orderItemId,
    requested_rating: rating,
    requested_comment: comment,
  });
  if (error) {
    if (error.message?.includes("VERIFIED_PURCHASE_REQUIRED")) return { ok: false, message: "შეფასება შესაძლებელია მხოლოდ ამ ანგარიშით მიღებული პროდუქტის მიწოდების შემდეგ." };
    if (error.message?.includes("function") || error.message?.includes("schema cache")) return { ok: false, message: "შეფასებების migration ჯერ Supabase-ში არ არის გაშვებული." };
    return { ok: false, message: "შეფასება ვერ შეინახა. სცადე თავიდან." };
  }
  refreshReviewPages(slug);
  return { ok: true, message: "შეფასება გამოქვეყნდა. მადლობა უკუკავშირისთვის!" };
}

export async function deleteProductReviewAction(formData: FormData): Promise<ProductReviewActionResult> {
  const supabase = (await createClient()) as any;
  if (!supabase) return { ok: false, message: "Supabase ჯერ არ არის დაკავშირებული." };
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, message: "ანგარიშში შესვლა საჭიროა." };
  const productId = String(formData.get("product_id") ?? "");
  const slug = safeSlug(formData.get("slug"));
  if (!uuidPattern.test(productId) || !slug) return { ok: false, message: "პროდუქტის მონაცემი არასწორია." };

  const { data, error } = await supabase.rpc("delete_my_product_review", { requested_product_id: productId });
  if (error || !data) return { ok: false, message: "შეფასება ვერ წაიშალა." };
  refreshReviewPages(slug);
  return { ok: true, message: "შეფასება წაიშალა." };
}
