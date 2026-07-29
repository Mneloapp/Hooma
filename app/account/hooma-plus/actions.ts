"use server";

import { revalidatePath } from "next/cache";
import {
  HOOMA_PLUS_PLANS,
  isHoomaPlusPlanCode,
} from "@/lib/commerce/hooma-plus";
import {
  BogPaymentError,
  createBogOrder,
  getBogPaymentDetails,
  getBogHoomaPlusReturnUrls,
  getBogPaymentMethods,
  getHoomaPlusCheckoutAvailability,
} from "@/lib/payments/bog";
import {
  isTrustedBogRedirect,
  minorToAmount,
  moneyToMinor,
  parseBogPaymentDetails,
  sanitizeBogPaymentDetails,
} from "@/lib/payments/bog-core";
import { reconcileCustomerHoomaPlusBogAttempts } from "@/lib/payments/bog-stale-recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type HoomaPlusCheckoutResult = {
  ok: boolean;
  message: string;
  redirectUrl?: string;
  resetCheckout?: boolean;
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const field = (formData: FormData, key: string) =>
  String(formData.get(key) ?? "").trim();

export async function createHoomaPlusCheckoutAction(
  formData: FormData,
): Promise<HoomaPlusCheckoutResult> {
  const georgian = field(formData, "language") !== "en";
  const planCode = field(formData, "plan");
  const checkoutKey = field(formData, "checkout_key");

  if (!isHoomaPlusPlanCode(planCode) || !uuidPattern.test(checkoutKey)) {
    return {
      ok: false,
      message: georgian
        ? "Hooma+ გადახდის სესია არასწორია. გვერდი განაახლე და თავიდან სცადე."
        : "The Hooma+ payment session is invalid. Refresh and try again.",
    };
  }

  if (!getHoomaPlusCheckoutAvailability().available) {
    return {
      ok: false,
      message: georgian
        ? "Hooma+ ონლაინ გადახდა ჯერ არ არის გააქტიურებული. თანხა არ ჩამოგეჭრება."
        : "Hooma+ online payment is not active yet. You will not be charged.",
    };
  }

  const supabase = (await createClient()) as any;
  const admin = createAdminClient() as any;
  if (!supabase || !admin) {
    return {
      ok: false,
      message: georgian
        ? "გადახდის სერვერი ჯერ არ არის დაკავშირებული."
        : "The payment server is not connected yet.",
    };
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) {
    return {
      ok: false,
      message: georgian
        ? "Hooma+ წევრობისთვის ჯერ ანგარიშში შედი."
        : "Sign in before purchasing Hooma+.",
    };
  }

  const { data: customer } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (!customer?.id) {
    return {
      ok: false,
      message: georgian
        ? "მომხმარებლის პროფილი ვერ მოიძებნა. გამოდი ანგარიშიდან და ხელახლა შედი."
        : "Your customer profile could not be found. Sign out and sign in again.",
    };
  }

  try {
    const recovery = await reconcileCustomerHoomaPlusBogAttempts(
      admin,
      customer.id,
    );
    if (recovery.redirectUrl) {
      return {
        ok: true,
        redirectUrl: recovery.redirectUrl,
        message: georgian
          ? "წინა უსაფრთხო Hooma+ გადახდის სესია აღდგა..."
          : "Your previous secure Hooma+ payment session was recovered...",
      };
    }
    if (recovery.blocked) {
      return {
        ok: false,
        message: georgian
          ? "წინა Hooma+ გადახდის საბოლოო საბანკო სტატუსს ველოდებით. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი."
          : "We are waiting for a previous Hooma+ payment's final bank status. Do not pay again; retry later or contact us.",
      };
    }
  } catch (error) {
    console.error("HOOMA_PLUS_CUSTOMER_STALE_RECONCILIATION_FAILED", {
      customerId: customer.id,
      retryable: error instanceof BogPaymentError ? error.retryable : null,
    });
    return {
      ok: false,
      message: georgian
        ? "წინა Hooma+ გადახდის უსაფრთხოდ შემოწმება ვერ მოხერხდა. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი."
        : "A previous Hooma+ payment could not be checked safely. Do not pay again; retry later or contact us.",
    };
  }

  const { data: checkoutData, error: checkoutError } = await admin.rpc(
    "begin_bog_hooma_plus_checkout_v1",
    {
      requested_customer_id: customer.id,
      requested_plan_code: planCode,
      requested_idempotency_key: checkoutKey,
    },
  );
  const checkout = checkoutData && typeof checkoutData === "object"
    ? checkoutData as Record<string, unknown>
    : null;
  const purchaseId = typeof checkout?.purchase_id === "string"
    ? checkout.purchase_id
    : "";
  const attemptId = typeof checkout?.attempt_id === "string"
    ? checkout.attempt_id
    : "";
  const attemptStatus = typeof checkout?.attempt_status === "string"
    ? checkout.attempt_status
    : "";
  const providerPaymentId = typeof checkout?.provider_payment_id === "string"
    ? checkout.provider_payment_id
    : "";
  const attemptCreatedAt = typeof checkout?.attempt_created_at === "string"
    ? Date.parse(checkout.attempt_created_at)
    : Number.NaN;
  const totalMinor = moneyToMinor(checkout?.amount);

  if (
    checkoutError
    || !uuidPattern.test(purchaseId)
    || !uuidPattern.test(attemptId)
    || !attemptStatus
    || totalMinor === null
    || totalMinor !== HOOMA_PLUS_PLANS[planCode].priceMinor
  ) {
    console.error("HOOMA_PLUS_CHECKOUT_PREPARATION_FAILED", {
      code: checkoutError?.code ?? null,
    });
    const inProgress = checkoutError?.message?.includes("HOOMA_PLUS_PAYMENT_IN_PROGRESS");
    const needsReview = checkoutError?.message?.includes("HOOMA_PLUS_PAYMENT_REVIEW_REQUIRED");
    return {
      ok: false,
      message: needsReview
        ? georgian
          ? "წინა Hooma+ გადახდას შემოწმება სჭირდება. ხელახლა ნუ გადაიხდი — დაგვიკავშირდი."
          : "A previous Hooma+ payment needs review. Do not pay again; contact us."
        : inProgress
          ? georgian
            ? "Hooma+ გადახდის სხვა სესია უკვე მიმდინარეობს. დაასრულე ის ან 20 წუთის შემდეგ სცადე."
            : "Another Hooma+ payment session is already in progress. Complete it or retry after 20 minutes."
          : georgian
            ? "Hooma+ გადახდის უსაფრთხოდ მომზადება ვერ მოხერხდა. თანხა არ ჩამოგეჭრება."
            : "The Hooma+ payment could not be prepared safely. You will not be charged.",
    };
  }

  const storedResponse = checkout?.response_payload
    && typeof checkout.response_payload === "object"
    ? checkout.response_payload as Record<string, unknown>
    : null;
  if (["paid", "refunded", "review_required"].includes(attemptStatus)) {
    return {
      ok: false,
      message: georgian
        ? "ამ Hooma+ გადახდის სტატუსი უკვე დაფიქსირებულია. წევრობის გვერდი განაახლე."
        : "This Hooma+ payment already has a recorded status. Refresh the membership page.",
    };
  }
  if (["failed", "cancelled"].includes(attemptStatus)) {
    return {
      ok: false,
      resetCheckout: true,
      message: georgian
        ? "წინა გადახდის სესია დასრულებულია. ახალი სესიისთვის ხელახლა დააჭირე."
        : "The previous payment session has ended. Press again to start a new session.",
    };
  }
  if (
    ["created", "pending"].includes(attemptStatus)
    && (
      !Number.isFinite(attemptCreatedAt)
      || Date.now() - attemptCreatedAt > 20 * 60 * 1000
    )
  ) {
    try {
      const plan = HOOMA_PLUS_PLANS[planCode];
      let recoveredProviderId = providerPaymentId;
      let recoveredRedirect = "";
      if (!recoveredProviderId) {
        const urls = getBogHoomaPlusReturnUrls(purchaseId);
        const recoveredPayment = await createBogOrder({
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
        recoveredProviderId = recoveredPayment.providerOrderId;
        recoveredRedirect = recoveredPayment.redirectUrl;
        const { error: recoveredBindError } = await admin.rpc(
          "bind_bog_hooma_plus_attempt_v1",
          {
            requested_attempt_id: attemptId,
            requested_provider_payment_id: recoveredProviderId,
            requested_response: recoveredPayment.safeResponse,
          },
        );
        if (
          recoveredBindError?.message?.includes(
            "HOOMA_PLUS_PROVIDER_ID_CONFLICT",
          )
        ) {
          throw new Error("HOOMA_PLUS_PROVIDER_ID_CONFLICT");
        }
      }

      const receipt = parseBogPaymentDetails(
        await getBogPaymentDetails(recoveredProviderId),
      );
      if (
        !receipt
        || receipt.orderId !== recoveredProviderId
        || receipt.externalOrderId !== attemptId
      ) {
        throw new Error("HOOMA_PLUS_STALE_RECEIPT_MISMATCH");
      }

      if (receipt.status === "rejected") {
        const { error: recoveryError } = await admin.rpc(
          "recover_rejected_bog_hooma_plus_v1",
          {
            requested_attempt_id: attemptId,
            requested_provider_payment_id: receipt.orderId,
            requested_external_order_id: receipt.externalOrderId,
            requested_provider_status: receipt.status,
            requested_capture: receipt.capture,
            requested_currency: receipt.currency,
            requested_request_amount: receipt.requestAmountMinor === null
              ? null
              : minorToAmount(receipt.requestAmountMinor),
            requested_has_split: receipt.hasSplit,
            requested_safe_payload: sanitizeBogPaymentDetails(receipt),
          },
        );
        if (recoveryError) throw recoveryError;
        return {
          ok: false,
          resetCheckout: true,
          message: georgian
            ? "წინა Hooma+ გადახდის სესია ბანკმა დახურა. ახალი სესიისთვის ხელახლა დააჭირე."
            : "The bank closed the previous Hooma+ payment session. Press again to start a new session.",
        };
      }

      if (
        recoveredRedirect
        && ["created", "processing"].includes(receipt.status)
      ) {
        return {
          ok: true,
          redirectUrl: recoveredRedirect,
          message: georgian
            ? "უსაფრთხო Hooma+ გადახდის სესია აღდგა..."
            : "Secure Hooma+ payment session recovered...",
        };
      }

      return {
        ok: false,
        message: receipt.status === "completed"
          ? georgian
            ? "ბანკში გადახდა ჩანს, მაგრამ დაცულ callback-ს ველოდებით. ხელახლა ნუ გადაიხდი; თუ სტატუსი არ განახლდა, დაგვიკავშირდი."
            : "The bank shows a payment, but we are waiting for the secure callback. Do not pay again; contact us if the status does not update."
          : georgian
            ? "წინა Hooma+ სესიის საბოლოო საბანკო სტატუსს ველოდებით. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი."
            : "We are waiting for the previous Hooma+ session's final bank status. Do not pay again; retry later or contact us.",
      };
    } catch (error) {
      console.error("HOOMA_PLUS_STALE_RECONCILIATION_FAILED", {
        attemptId,
        retryable: error instanceof BogPaymentError ? error.retryable : null,
      });
    }
    return {
      ok: false,
      message: georgian
        ? "წინა Hooma+ სესიის უსაფრთხოდ დახურვა ვერ მოხერხდა. ხელახლა ნუ გადაიხდი; მოგვიანებით სცადე ან დაგვიკავშირდი."
        : "The previous Hooma+ session could not be closed safely. Do not pay again; retry later or contact us.",
    };
  }
  if (["created", "pending"].includes(attemptStatus) && isTrustedBogRedirect(storedResponse?.redirect_url)) {
    return {
      ok: true,
      redirectUrl: storedResponse.redirect_url,
      message: georgian
        ? "გადამისამართება უსაფრთხო გადახდაზე..."
        : "Redirecting to secure payment...",
    };
  }

  const plan = HOOMA_PLUS_PLANS[planCode];
  try {
    const urls = getBogHoomaPlusReturnUrls(purchaseId);
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

    const { error: bindError } = await admin.rpc(
      "bind_bog_hooma_plus_attempt_v1",
      {
        requested_attempt_id: attemptId,
        requested_provider_payment_id: payment.providerOrderId,
        requested_response: payment.safeResponse,
      },
    );
    if (bindError) {
      console.error("HOOMA_PLUS_CHECKOUT_BIND_FAILED", {
        attemptId,
        providerOrderId: payment.providerOrderId,
        code: bindError.code ?? null,
      });
      if (!bindError.message?.includes("HOOMA_PLUS_PROVIDER_ID_CONFLICT")) {
        return {
          ok: true,
          redirectUrl: payment.redirectUrl,
          message: georgian
            ? "გადამისამართება უსაფრთხო გადახდაზე..."
            : "Redirecting to secure payment...",
        };
      }
      return {
        ok: false,
        message: georgian
          ? "გადახდის სესია შეიქმნა, მაგრამ დაკავშირება ვერ დასრულდა. ხელახლა ნუ გადაიხდი — დაგვიკავშირდი."
          : "The payment session was created but could not be linked. Do not pay again; contact us.",
      };
    }

    revalidatePath("/account/hooma-plus");
    return {
      ok: true,
      redirectUrl: payment.redirectUrl,
      message: georgian
        ? "გადამისამართება უსაფრთხო გადახდაზე..."
        : "Redirecting to secure payment...",
    };
  } catch (error) {
    const retryable = error instanceof BogPaymentError && error.retryable;
    console.error("HOOMA_PLUS_CHECKOUT_INITIALIZATION_FAILED", {
      attemptId,
      retryable,
      status: error instanceof BogPaymentError ? error.status : null,
    });
    return {
      ok: false,
      message: georgian
        ? retryable
          ? "BOG დროებით მიუწვდომელია. თანხა არ ჩამოგეჭრება; რამდენიმე წუთში იგივე ღილაკით სცადე."
          : "Hooma+ გადახდის შექმნა ვერ მოხერხდა. თანხა არ ჩამოგეჭრება."
        : retryable
          ? "BOG is temporarily unavailable. You will not be charged; retry in a few minutes."
          : "The Hooma+ payment could not be created. You will not be charged.",
    };
  }
}
