import { requireMobileAuth } from "@/lib/mobile-api/auth";
import { mobileError, mobileJson, uuidPattern } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireMobileAuth(request);
    const id = (await context.params).id;
    if (!uuidPattern.test(id)) return mobileJson({ ok: false, code: "invalid_order_id" }, 400);
    const [{ data: order, error }, { data: events }, { data: items }] = await Promise.all([
      auth.admin
        .from("orders")
        .select("id,tracking_code,status,payment_status,subtotal,delivery_fee,delivery_benefit_code,total,fulfillment_status,promised_at,delivery_address,test_mode,created_at")
        .eq("id", id)
        .eq("customer_id", auth.customerId)
        .maybeSingle(),
      auth.admin
        .from("order_events")
        .select("id,event_type,customer_label_ka,customer_label_en,created_at")
        .eq("order_id", id)
        .eq("is_customer_visible", true)
        .order("created_at"),
      auth.admin
        .from("order_items")
        .select("id,product_id,product_name,size_label,material,color,quantity,unit_price")
        .eq("order_id", id)
        .order("created_at"),
    ]);
    if (error) throw error;
    if (!order) return mobileJson({ ok: false, code: "order_not_found" }, 404);
    return mobileJson({ ok: true, data: { ...order, items: items ?? [], events: events ?? [] } });
  } catch (error) {
    return mobileError(error);
  }
}
