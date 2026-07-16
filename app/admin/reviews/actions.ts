"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requirePermission } from "@/lib/supabase/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function moderateProductReviewAction(formData: FormData) {
  const profile = await requirePermission("catalog.manage");
  const admin = createAdminClient() as any;
  if (!profile || !admin || !["owner", "admin", "catalog_manager"].includes(profile.role)) return;
  const reviewId = String(formData.get("review_id") ?? "");
  const status = String(formData.get("status") ?? "");
  const note = String(formData.get("note") ?? "").trim().slice(0, 1000);
  if (!uuidPattern.test(reviewId) || !["published", "hidden", "rejected"].includes(status)) return;

  await admin.rpc("moderate_product_review", {
    actor_profile_id: profile.id,
    requested_review_id: reviewId,
    requested_status: status,
    requested_note: note || null,
  });
  revalidatePath("/admin/reviews");
  revalidatePath("/");
  revalidatePath("/shop");
  revalidatePath("/product/[slug]", "page");
}
