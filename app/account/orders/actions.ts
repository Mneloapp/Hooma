"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  BogPaymentError,
  getBogCustomerRefundAvailability,
  requestBogFullRefund,
} from "@/lib/payments/bog";

export type CustomerOrderCancellationResult = {
  ok: boolean;
  state: "unavailable" | "processing" | "review" | "refunded" | "invalid";
  message: string;
};

export type CustomerOrderCancellationInput = {
  orderId: string;
  reason: string;
  operationKey: string;
  language?: "ka" | "en";
};

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const refundStatuses = new Set([
  "processing",
  "refund_submitted",
  "submission_failed",
  "review_required",
  "refunded",
]);

const ka = (input: CustomerOrderCancellationInput | null | undefined) => input?.language !== "en";

function refreshOrderViews() {
  revalidatePath("/account/orders");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/production");
}

function normalizeReason(value: unknown) {
  if (typeof value !== "string") return null;
  const normalized = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (normalized.length > 500) return null;
  return normalized || undefined;
}

function objectOrNull(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function resultForExisting(
  status: string,
  georgian: boolean,
): CustomerOrderCancellationResult {
  if (status === "refunded") {
    return {
      ok: true,
      state: "refunded",
      message: georgian
        ? "შეკვეთა უკვე გაუქმებულია და თანხის დაბრუნება BOG-ის მიერ დადასტურებულია."
        : "The order is already cancelled and BOG has confirmed the refund.",
    };
  }
  if (status === "processing" || status === "refund_submitted") {
    return {
      ok: true,
      state: "processing",
      message: georgian
        ? "გაუქმების მოთხოვნა უკვე მიღებულია. თანხის დაბრუნების საბოლოო დასტურს ველოდებით — მოთხოვნა აღარ გაიმეორო."
        : "Your cancellation request is already recorded. We are waiting for final refund confirmation; do not submit it again.",
    };
  }
  return {
    ok: true,
    state: "review",
    message: georgian
      ? "თანხის დაბრუნებას ჩვენი გუნდის შემოწმება სჭირდება. მოთხოვნა აღარ გაიმეორო — დაგიკავშირდებით ან შეგიძლია support@hooma.ge-ზე მოგვწერო."
      : "The refund needs review by our team. Do not submit it again; we will contact you, or you can email support@hooma.ge.",
  };
}

function resultForClaimError(
  errorMessage: string,
  georgian: boolean,
): CustomerOrderCancellationResult {
  if (errorMessage.includes("REFUND_PRODUCTION_STARTED")) {
    return {
      ok: false,
      state: "unavailable",
      message: georgian
        ? "ავტომატური გაუქმება აღარ არის ხელმისაწვდომი, რადგან შეკვეთა წარმოების ეტაპზე გადავიდა. დახმარებისთვის დაგვიკავშირდი."
        : "Automatic cancellation is no longer available because the order entered production. Contact support for help.",
    };
  }
  if (
    errorMessage.includes("REFUND_FORBIDDEN")
    || errorMessage.includes("REFUND_ORDER_NOT_FOUND")
  ) {
    return {
      ok: false,
      state: "invalid",
      message: georgian
        ? "შეკვეთა ვერ მოიძებნა ან მისი გაუქმების უფლება არ გაქვს."
        : "The order was not found or you are not allowed to cancel it.",
    };
  }
  if (
    errorMessage.includes("REFUND_INVALID_REQUEST")
    || errorMessage.includes("REFUND_OPERATION_KEY_CONFLICT")
  ) {
    return {
      ok: false,
      state: "invalid",
      message: georgian
        ? "გაუქმების მოთხოვნა არასწორია ან უკვე გამოყენებულია. გვერდი განაახლე და თავიდან სცადე."
        : "The cancellation request is invalid or has already been used. Refresh the page and try again.",
    };
  }
  if (
    errorMessage.includes("REFUND_ORDER_NOT_ELIGIBLE")
    || errorMessage.includes("REFUND_PAYMENT_NOT_ELIGIBLE")
  ) {
    return {
      ok: false,
      state: "unavailable",
      message: georgian
        ? "ამ შეკვეთის ავტომატურად გაუქმება ვერ ხერხდება. თანხა ხელახლა არ გადაიხადო და დახმარებისთვის მოგვწერე support@hooma.ge-ზე."
        : "This order cannot be cancelled automatically. Do not make another payment; email support@hooma.ge for help.",
    };
  }
  return {
    ok: false,
    state: "review",
    message: georgian
      ? "შეკვეთის გაუქმება უსაფრთხოდ ვერ მომზადდა. დაგვიკავშირდი support@hooma.ge-ზე."
      : "The cancellation could not be prepared safely. Contact support@hooma.ge.",
  };
}

async function recordSubmission(
  admin: any,
  input: {
    refundRequestId: string;
    idempotencyKey: string;
    outcome: "accepted" | "definite_failure" | "uncertain";
    providerStatus: string | null;
    httpStatus: number | null;
    errorCode: string | null;
    safeResponse: Record<string, unknown>;
  },
) {
  return admin.rpc("record_bog_refund_submission_v1", {
    requested_refund_request_id: input.refundRequestId,
    requested_provider_refund_idempotency_key: input.idempotencyKey,
    requested_outcome: input.outcome,
    requested_provider_status: input.providerStatus,
    requested_http_status: input.httpStatus,
    requested_error_code: input.errorCode,
    requested_safe_response: input.safeResponse,
  });
}

export async function requestCustomerOrderCancellationAction(
  input: CustomerOrderCancellationInput,
): Promise<CustomerOrderCancellationResult> {
  const georgian = ka(input);
  const reasonNote = normalizeReason(input?.reason);
  if (
    !input
    || !uuidPattern.test(String(input.orderId ?? ""))
    || !uuidV4Pattern.test(String(input.operationKey ?? ""))
    || reasonNote === null
  ) {
    return {
      ok: false,
      state: "invalid",
      message: georgian
        ? "გაუქმების მოთხოვნის მონაცემები არასწორია. გვერდი განაახლე და თავიდან სცადე."
        : "The cancellation request is invalid. Refresh the page and try again.",
    };
  }

  if (!getBogCustomerRefundAvailability().available) {
    return {
      ok: false,
      state: "unavailable",
      message: georgian
        ? "ონლაინ გაუქმება დროებით მიუწვდომელია. შეკვეთა არ შეცვლილა — მოგვწერე support@hooma.ge-ზე."
        : "Online cancellation is temporarily unavailable. Your order has not changed; email support@hooma.ge.",
    };
  }

  const supabase = await createClient();
  if (!supabase) {
    return {
      ok: false,
      state: "unavailable",
      message: georgian
        ? "გაუქმების სერვერი დროებით მიუწვდომელია."
        : "The cancellation service is temporarily unavailable.",
    };
  }
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;
  if (userError || !user) {
    return {
      ok: false,
      state: "invalid",
      message: georgian
        ? "შეკვეთის გასაუქმებლად ანგარიშში შედი."
        : "Sign in to cancel an order.",
    };
  }

  const admin = createAdminClient() as any;
  if (!admin) {
    return {
      ok: false,
      state: "unavailable",
      message: georgian
        ? "გაუქმების სერვერი დროებით მიუწვდომელია."
        : "The cancellation service is temporarily unavailable.",
    };
  }

  const { data: claimData, error: claimError } = await admin.rpc(
    "claim_customer_bog_refund_v1",
    {
      actor_profile_id: user.id,
      operation_key: input.operationKey,
      requested_order_id: input.orderId,
      requested_reason_code: "customer_requested",
      requested_reason_note: reasonNote ?? null,
    },
  );
  const claim = objectOrNull(claimData);
  const refundRequestId = safeText(claim?.refund_request_id);
  const claimedOrderId = safeText(claim?.order_id);
  const paymentAttemptId = safeText(claim?.payment_attempt_id);
  const providerPaymentId = typeof claim?.provider_payment_id === "string"
    ? claim.provider_payment_id
    : "";
  const providerIdempotencyKey = safeText(claim?.provider_refund_idempotency_key);
  const status = safeText(claim?.status);
  const currency = safeText(claim?.currency);
  const refundAmount = Number(claim?.refund_amount);
  const created = claim?.created === true;
  const should_submit = claim?.should_submit === true;

  if (
    claimError
    || !claim
    || !uuidPattern.test(refundRequestId)
    || claimedOrderId !== input.orderId
    || !uuidPattern.test(paymentAttemptId)
    || !providerPaymentId
    || providerPaymentId.length > 128
    || providerPaymentId !== providerPaymentId.trim()
    || !uuidV4Pattern.test(providerIdempotencyKey)
    || !refundStatuses.has(status)
    || currency !== "GEL"
    || !Number.isFinite(refundAmount)
    || refundAmount <= 0
    || typeof claim.created !== "boolean"
    || typeof claim.should_submit !== "boolean"
    || created !== should_submit
    || (should_submit && (!created || status !== "processing"))
  ) {
    console.error("BOG_CUSTOMER_REFUND_CLAIM_FAILED", {
      code: claimError?.code ?? null,
      malformed: !claimError,
    });
    if (
      !claimError
      && uuidPattern.test(refundRequestId)
      && uuidV4Pattern.test(providerIdempotencyKey)
    ) {
      const { error: recordError } = await recordSubmission(admin, {
        refundRequestId,
        idempotencyKey: providerIdempotencyKey,
        outcome: "definite_failure",
        providerStatus: null,
        httpStatus: null,
        errorCode: "invalid_claim_response",
        safeResponse: { accepted: false, category: "internal_validation" },
      });
      console.error("BOG_CUSTOMER_REFUND_INVALID_CLAIM_RECORDED", {
        recordCode: recordError?.code ?? null,
      });
      refreshOrderViews();
      return {
        ok: true,
        state: "review",
        message: georgian
          ? "გაუქმების მოთხოვნა დაფიქსირდა, მაგრამ თანხის დაბრუნებას ჩვენი გუნდის შემოწმება სჭირდება. მოთხოვნა აღარ გაიმეორო."
          : "The cancellation was recorded, but the refund needs review by our team. Do not submit it again.",
      };
    }
    return resultForClaimError(claimError?.message ?? "", georgian);
  }

  if (!should_submit) {
    refreshOrderViews();
    return resultForExisting(status, georgian);
  }

  try {
    const submission = await requestBogFullRefund(
      providerPaymentId,
      providerIdempotencyKey,
    );
    const { data: recordData, error: recordError } = await recordSubmission(admin, {
      refundRequestId,
      idempotencyKey: providerIdempotencyKey,
      outcome: "accepted",
      providerStatus: submission.requestStatus,
      httpStatus: submission.httpStatus,
      errorCode: null,
      safeResponse: {
        key: submission.requestStatus,
        action_id: submission.actionId,
      },
    });
    const recorded = objectOrNull(recordData);
    const recordedStatus = safeText(recorded?.status);
    refreshOrderViews();
    if (
      recordError
      || !recorded
      || safeText(recorded.refund_request_id) !== refundRequestId
      || safeText(recorded.order_id) !== input.orderId
      || !recordedStatus
    ) {
      console.error("BOG_CUSTOMER_REFUND_RECORD_FAILED", {
        code: recordError?.code ?? null,
        stage: "accepted",
      });
      return {
        ok: true,
        state: "review",
        message: georgian
          ? "BOG-მა თანხის დაბრუნების მოთხოვნა მიიღო, თუმცა ჩანაწერი დამატებით მოწმდება. მოთხოვნა აღარ გაიმეორო."
          : "BOG received the refund request, but the record needs additional verification. Do not submit it again.",
      };
    }
    if (recorded.refunded === true || recordedStatus === "refunded") {
      return resultForExisting("refunded", georgian);
    }
    if (recorded.requires_review === true || recordedStatus === "review_required") {
      return resultForExisting("review_required", georgian);
    }
    return {
      ok: true,
      state: "processing",
      message: georgian
        ? "გაუქმების მოთხოვნა მიღებულია და სრული თანხის დაბრუნება BOG-ში მუშავდება. საბოლოო დასტურს შეკვეთის გვერდზე ნახავ."
        : "Your cancellation request was received and BOG is processing the full refund. Final confirmation will appear on the order page.",
    };
  } catch (error) {
    const bogError = error instanceof BogPaymentError ? error : null;
    const httpStatus = bogError?.status ?? null;
    const definiteFailure = httpStatus !== null
      && httpStatus >= 400
      && httpStatus < 500
      && httpStatus !== 408
      && httpStatus !== 429;
    const outcome = definiteFailure ? "definite_failure" as const : "uncertain" as const;
    const { data: recordData, error: recordError } = await recordSubmission(admin, {
      refundRequestId,
      idempotencyKey: providerIdempotencyKey,
      outcome,
      providerStatus: null,
      httpStatus,
      errorCode: definiteFailure
        ? "refund_request_rejected"
        : "refund_request_outcome_unknown",
      safeResponse: {
        accepted: false,
        retryable: bogError?.retryable ?? false,
        category: definiteFailure ? "provider_rejected" : "outcome_unknown",
      },
    });
    const recorded = objectOrNull(recordData);
    const recordedStatus = safeText(recorded?.status);
    refreshOrderViews();
    console.error("BOG_CUSTOMER_REFUND_SUBMISSION_FAILED", {
      recordCode: recordError?.code ?? null,
      httpStatus,
      outcome,
    });
    if (
      !recordError
      && recorded
      && safeText(recorded.refund_request_id) === refundRequestId
      && safeText(recorded.order_id) === input.orderId
      && (recorded.refunded === true || recordedStatus === "refunded")
    ) {
      return resultForExisting("refunded", georgian);
    }
    return {
      ok: true,
      state: "review",
      message: georgian
        ? "თანხის დაბრუნების საბანკო შედეგი ავტომატურად ვერ დადასტურდა. მოთხოვნა აღარ გაიმეორო — ჩვენი გუნდი გადაამოწმებს."
        : "The bank result for this refund could not be confirmed automatically. Do not submit it again; our team will review it.",
    };
  }
}
