import { requireMobileAuth } from "@/lib/mobile-api/auth";
import { mobileError, mobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const query = new URL(request.url).searchParams;
    const page = Math.min(100, Math.max(1, Number(query.get("page") ?? 1) || 1));
    const pageSize = Math.min(30, Math.max(1, Number(query.get("pageSize") ?? 20) || 20));
    const from = (page - 1) * pageSize;
    const { data, error, count } = await auth.admin
      .from("orders")
      .select(
        "id,tracking_code,status,payment_status,subtotal,delivery_fee,delivery_benefit_code,total,fulfillment_status,promised_at,delivery_address,test_mode,created_at,order_items(id,product_id,product_name,size_label,material,color,quantity,unit_price)",
        { count: "exact" },
      )
      .eq("customer_id", auth.customerId)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    return mobileJson({
      ok: true,
      data: {
        items: data ?? [],
        totalCount: count ?? 0,
        page,
        pageSize,
        hasMore: from + pageSize < (count ?? 0),
      },
    });
  } catch (error) {
    return mobileError(error);
  }
}
