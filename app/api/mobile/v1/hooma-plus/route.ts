import {
  DELIVERY_POLICY,
  parseHoomaPlusSummary,
} from "@/lib/commerce/hooma-plus";
import { requireMobileAuth } from "@/lib/mobile-api/auth";
import { mobileError, mobileJson } from "@/lib/mobile-api/http";
import { getHoomaPlusCheckoutAvailability } from "@/lib/payments/bog";
import { processHoomaPlusCheckout } from "@/lib/commerce/hooma-plus-checkout-service";
import { enforceMobileRateLimit } from "@/lib/mobile-api/auth";
import { asRecord, readMobileJson } from "@/lib/mobile-api/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    const [{ data: summaryData, error: summaryError }, { data: purchases, error }] = await Promise.all([
      auth.userClient.rpc("get_my_hooma_plus_summary_v1"),
      auth.admin
        .from("hooma_plus_purchases")
        .select("id,plan_code,plan_label_ka,plan_label_en,amount,currency,status,activated_at,expires_at,created_at")
        .eq("customer_id", auth.customerId)
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    if (error) throw error;
    const summary = parseHoomaPlusSummary(summaryData) ?? {
      active: false,
      activeUntil: null,
      welcomeUnitsTotal: DELIVERY_POLICY.welcomeUnits,
      welcomeUnitsConsumed: 0,
      welcomeUnitsReserved: 0,
      welcomeUnitsRemaining: 0,
    };
    return mobileJson({
      ok: true,
      data: {
        summary,
        purchases: purchases ?? [],
        rulesReady: !summaryError && Boolean(parseHoomaPlusSummary(summaryData)),
        paymentAvailable: getHoomaPlusCheckoutAvailability().available,
        plans: [
          { code: "monthly", priceMinor: 3500, durationMonths: 1 },
          { code: "annual", priceMinor: 35000, durationMonths: 12 },
        ],
      },
    });
  } catch (error) {
    return mobileError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireMobileAuth(request);
    await enforceMobileRateLimit(request, "hooma-plus:checkout", 10, 3600, auth.user.id);
    const input = asRecord(await readMobileJson(request, 4096));
    if (!input) return mobileJson({ ok: false, code: "invalid_request" }, 400);
    const result = await processHoomaPlusCheckout({
      plan: input.plan,
      checkoutKey: input.checkoutKey,
      language: input.language,
    }, {
      admin: auth.admin,
      customerId: auth.customerId,
      channel: "mobile",
    });
    return mobileJson(result, result.ok ? 200 : 400);
  } catch (error) {
    return mobileError(error);
  }
}
