import { requireMobileAuth } from "@/lib/mobile-api/auth";
import { mobileError, mobileJson, uuidPattern } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const orderId = new URL(request.url).searchParams.get("order") ?? "";
    if (!uuidPattern.test(orderId)) {
      return mobileJson({ ok: false, code: "invalid_order_id" }, 400);
    }
    const { data, error } = await auth.admin
      .from("orders")
      .select("id,tracking_code,payment_status,fulfillment_status,subtotal,delivery_fee,delivery_benefit_code,total,test_mode,created_at")
      .eq("id", orderId)
      .eq("customer_id", auth.customerId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return mobileJson({ ok: false, code: "order_not_found" }, 404);
    return mobileJson({ ok: true, data });
  } catch (error) {
    return mobileError(error);
  }
}
