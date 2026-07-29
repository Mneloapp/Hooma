import "server-only";

import {
  HOOMA_PLUS_PLANS,
  isHoomaPlusPlanCode,
} from "@/lib/commerce/hooma-plus";
import {
  createBogOrder,
  getBogHoomaPlusReturnUrls,
  getBogMobileHoomaPlusReturnUrls,
  getBogPaymentMethods,
  getHoomaPlusCheckoutAvailability,
} from "@/lib/payments/bog";
import {
  isTrustedBogRedirect,
  moneyToMinor,
} from "@/lib/payments/bog-core";
import { reconcileCustomerHoomaPlusBogAttempts } from "@/lib/payments/bog-stale-recovery";
import { uuidPattern } from "@/lib/mobile-api/http";

export type HoomaPlusCheckoutServiceResult = {
  ok: boolean;
  code: string;
  message: string;
  redirectUrl?: string;
  resetCheckout?: boolean;
  purchaseId?: string;
};

export async function processHoomaPlusCheckout(input: {
  plan: unknown;
  checkoutKey: unknown;
  language?: unknown;
}, context: {
  admin: any;
  customerId: string;
  channel: "web" | "mobile";
}): Promise<HoomaPlusCheckoutServiceResult> {
  const georgian = input.language !== "en";
  const planCode = typeof input.plan === "string" ? input.plan : "";
  const checkoutKey = typeof input.checkoutKey === "string" ? input.checkoutKey : "";
  const message = (ka: string, en: string) => georgian ? ka : en;
  if (!isHoomaPlusPlanCode(planCode) || !uuidPattern.test(checkoutKey)) {
    return {
      ok: false,
      code: "invalid_request",
      message: message("Hooma+ გადახდის სესია არასწორია.", "The Hooma+ payment session is invalid."),
    };
  }
  if (!getHoomaPlusCheckoutAvailability().available) {
    return {
      ok: false,
      code: "payment_unavailable",
      message: message("Hooma+ ონლაინ გადახდა ჯერ არ არის გააქტიურებული.", "Hooma+ online payment is not active yet."),
    };
  }

  const recovery = await reconcileCustomerHoomaPlusBogAttempts(context.admin, context.customerId);
  if (recovery.redirectUrl) {
    return {
      ok: true,
      code: "checkout_recovered",
      redirectUrl: recovery.redirectUrl,
      message: message("წინა უსაფრთხო Hooma+ სესია აღდგა...", "The previous secure Hooma+ session was recovered..."),
    };
  }
  if (recovery.blocked) {
    return {
      ok: false,
      code: "previous_payment_pending",
      message: message("წინა Hooma+ გადახდის სტატუსს ველოდებით. ხელახლა ნუ გადაიხდი.", "We are waiting for the previous Hooma+ payment status. Do not pay again."),
    };
  }

  const { data, error } = await context.admin.rpc("begin_bog_hooma_plus_checkout_v1", {
    requested_customer_id: context.customerId,
    requested_plan_code: planCode,
    requested_idempotency_key: checkoutKey,
  });
  const checkout = data && typeof data === "object" ? data as Record<string, unknown> : null;
  const purchaseId = typeof checkout?.purchase_id === "string" ? checkout.purchase_id : "";
  const attemptId = typeof checkout?.attempt_id === "string" ? checkout.attempt_id : "";
  const attemptStatus = typeof checkout?.attempt_status === "string" ? checkout.attempt_status : "";
  const providerPaymentId = typeof checkout?.provider_payment_id === "string"
    ? checkout.provider_payment_id
    : "";
  const totalMinor = moneyToMinor(checkout?.amount);
  if (
    error
    || !uuidPattern.test(purchaseId)
    || !uuidPattern.test(attemptId)
    || totalMinor !== HOOMA_PLUS_PLANS[planCode].priceMinor
  ) {
    return {
      ok: false,
      code: "checkout_preparation_failed",
      message: message("Hooma+ გადახდის მომზადება ვერ მოხერხდა.", "The Hooma+ payment could not be prepared."),
    };
  }
  if (["paid", "refunded", "review_required"].includes(attemptStatus)) {
    return {
      ok: false,
      code: "payment_already_settled",
      message: message("ამ Hooma+ გადახდის სტატუსი უკვე დაფიქსირებულია.", "This Hooma+ payment already has a recorded status."),
    };
  }
  if (["failed", "cancelled"].includes(attemptStatus)) {
    return {
      ok: false,
      code: "payment_session_closed",
      resetCheckout: true,
      message: message("წინა გადახდის სესია დასრულებულია. შექმენი ახალი.", "The previous payment session ended. Create a new one."),
    };
  }
  const storedResponse = checkout?.response_payload && typeof checkout.response_payload === "object"
    ? checkout.response_payload as Record<string, unknown>
    : null;
  if (isTrustedBogRedirect(storedResponse?.redirect_url)) {
    return {
      ok: true,
      code: "checkout_reused",
      purchaseId,
      redirectUrl: storedResponse.redirect_url,
      message: message("გადამისამართება უსაფრთხო გადახდაზე...", "Redirecting to secure payment..."),
    };
  }
  if (providerPaymentId) {
    return {
      ok: false,
      code: "payment_confirmation_pending",
      message: message("გადახდის სესია მოწმდება. ხელახლა ნუ გადაიხდი.", "The payment session is being verified. Do not pay again."),
    };
  }

  const plan = HOOMA_PLUS_PLANS[planCode];
  const urls = context.channel === "mobile"
    ? getBogMobileHoomaPlusReturnUrls(purchaseId)
    : getBogHoomaPlusReturnUrls(purchaseId);
  const payment = await createBogOrder({
    callbackUrl: urls.callbackUrl,
    externalOrderId: attemptId,
    totalMinor,
    basket: [{
      productId: `hooma-plus-${plan.code}`,
      description: plan.code === "monthly"
        ? "Hooma+ Monthly Membership"
        : "Hooma+ Annual Membership",
      quantity: 1,
      unitPriceMinor: totalMinor,
    }],
    ttlMinutes: 15,
    successUrl: urls.successUrl,
    failUrl: urls.failUrl,
    paymentMethods: getBogPaymentMethods(),
  }, checkoutKey, georgian ? "ka" : "en");
  const { error: bindError } = await context.admin.rpc("bind_bog_hooma_plus_attempt_v1", {
    requested_attempt_id: attemptId,
    requested_provider_payment_id: payment.providerOrderId,
    requested_response: payment.safeResponse,
  });
  if (bindError?.message?.includes("HOOMA_PLUS_PROVIDER_ID_CONFLICT")) {
    return {
      ok: false,
      code: "payment_bind_conflict",
      message: message("გადახდის დაკავშირება ვერ დასრულდა. ხელახლა ნუ გადაიხდი.", "The payment could not be linked. Do not pay again."),
    };
  }
  return {
    ok: true,
    code: bindError ? "checkout_callback_binding_pending" : "checkout_created",
    purchaseId,
    redirectUrl: payment.redirectUrl,
    message: message("გადამისამართება უსაფრთხო გადახდაზე...", "Redirecting to secure payment..."),
  };
}
