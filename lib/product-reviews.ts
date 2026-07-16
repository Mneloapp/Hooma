import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, getSessionUser } from "@/lib/supabase/server";

export type PublicProductReview = {
  id: string;
  productId: string;
  rating: number;
  comment: string;
  reviewerName: string;
  verifiedPurchase: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MyProductReview = {
  id: string;
  rating: number;
  comment: string;
  status: "published" | "hidden" | "rejected";
  verifiedPurchase: boolean;
  updatedAt: string;
};

export type ProductReviewContext = {
  authenticated: boolean;
  eligible: boolean;
  orderItemId: string | null;
  review: MyProductReview | null;
};

export type ProductReviewData = {
  reviews: PublicProductReview[];
  context: ProductReviewContext;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emptyContext: ProductReviewContext = { authenticated: false, eligible: false, orderItemId: null, review: null };

export async function getProductReviewData(productId: string): Promise<ProductReviewData> {
  if (!uuidPattern.test(productId)) return { reviews: [], context: emptyContext };
  const admin = createAdminClient() as any;
  const user = await getSessionUser();
  const reviewPromise = admin
    ? admin.from("product_public_reviews")
      .select("id,product_id,rating,comment,reviewer_name,verified_purchase,created_at,updated_at")
      .eq("product_id", productId)
      .order("updated_at", { ascending: false })
      .limit(100)
    : Promise.resolve({ data: [] });
  const contextPromise = user
    ? (async () => {
      const supabase = (await createClient()) as any;
      return supabase?.rpc("get_my_product_review_context", { requested_product_id: productId })
        ?? { data: null };
    })()
    : Promise.resolve({ data: null });
  const [{ data: reviewRows }, { data: contextRow }] = await Promise.all([reviewPromise, contextPromise]);
  const rawContext = contextRow && typeof contextRow === "object" ? contextRow as Record<string, any> : null;
  const rawReview = rawContext?.review && typeof rawContext.review === "object" ? rawContext.review as Record<string, any> : null;

  return {
    reviews: (reviewRows ?? []).map((row: any) => ({
      id: String(row.id),
      productId: String(row.product_id),
      rating: Number(row.rating),
      comment: String(row.comment),
      reviewerName: String(row.reviewer_name || "Hooma მომხმარებელი"),
      verifiedPurchase: Boolean(row.verified_purchase),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    })),
    context: user ? {
      authenticated: true,
      eligible: Boolean(rawContext?.eligible),
      orderItemId: typeof rawContext?.order_item_id === "string" ? rawContext.order_item_id : null,
      review: rawReview ? {
        id: String(rawReview.id),
        rating: Number(rawReview.rating),
        comment: String(rawReview.comment),
        status: rawReview.status === "hidden" || rawReview.status === "rejected" ? rawReview.status : "published",
        verifiedPurchase: Boolean(rawReview.verified_purchase),
        updatedAt: String(rawReview.updated_at),
      } : null,
    } : emptyContext,
  };
}
