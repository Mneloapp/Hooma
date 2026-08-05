import "server-only";

import {
  createBogOrder,
  getBogHoomaPlusReturnUrls,
  getBogPaymentDetails,
  getBogPaymentMethods,
  getBogReturnUrls,
} from "@/lib/payments/bog";
import {
  minorToAmount,
  moneyToMinor,
  parseBogPaymentDetails,
  sanitizeBogPaymentDetails,
} from "@/lib/payments/bog-core";

type RecoveryResult = {
  blocked: boolean;
  redirectUrl?: string;
  orderId?: string;
};

type RecoveryBasketLine = {
  productId: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
};

const STALE_AFTER_MS = 20 * 60 * 1000;
const STALE_BATCH_SIZE = 10;

const asRecord = (value: unknown): Record<string, any> | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, any>;
};

const relationOne = (value: unknown) =>
  asRecord(Array.isArray(value) ? value[0] : value);

async function rejectedCatalogReceipt(
  admin: any,
  attemptId: string,
  receipt: NonNullable<ReturnType<typeof parseBogPaymentDetails>>,
) {
  const { error } = await admin.rpc(
    "release_rejected_bog_delivery_reservation_v1",
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
  return !error;
}

async function rejectedMembershipReceipt(
  admin: any,
  attemptId: string,
  receipt: NonNullable<ReturnType<typeof parseBogPaymentDetails>>,
) {
  const { error } = await admin.rpc(
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
  return !error;
}

export async function reconcileCustomerCatalogBogAttempts(
  admin: any,
  customerId: string,
): Promise<RecoveryResult> {
  const { count: reviewCount, error: reviewError } = await admin
    .from("payment_attempts")
    .select("id,orders!inner(customer_id,test_mode)", {
      count: "exact",
      head: true,
    })
    .eq("provider", "bog")
    .eq("status", "review_required")
    .eq("orders.customer_id", customerId)
    .eq("orders.test_mode", false);
  if (reviewError || (reviewCount ?? 0) > 0) {
    // A review hold may represent a real charge. Never create another catalog
    // payment until support resolves the existing attempt explicitly.
    return { blocked: true };
  }

  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data, error } = await admin
    .from("payment_attempts")
    .select(
      "id,provider_payment_id,idempotency_key,amount,currency,status,request_payload,response_payload,orders!inner(id,customer_id,delivery_fee,total)",
    )
    .eq("provider", "bog")
    .in("status", ["created", "pending"])
    .eq("orders.customer_id", customerId)
    .lt("created_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(STALE_BATCH_SIZE);

  if (error) return { blocked: true };
  for (const raw of data ?? []) {
    const attempt = asRecord(raw);
    const order = relationOne(attempt?.orders);
    const attemptId = typeof attempt?.id === "string" ? attempt.id : "";
    const orderId = typeof order?.id === "string" ? order.id : "";
    const checkoutKey = typeof attempt?.idempotency_key === "string"
      ? attempt.idempotency_key
      : "";
    const totalMinor = moneyToMinor(attempt?.amount);
    const deliveryMinor = moneyToMinor(order?.delivery_fee);
    if (
      !attemptId
      || !orderId
      || !checkoutKey
      || totalMinor === null
      || deliveryMinor === null
    ) {
      return { blocked: true };
    }

    let providerOrderId = typeof attempt?.provider_payment_id === "string"
      ? attempt.provider_payment_id
      : "";
    let recoveredRedirect = "";
    if (!providerOrderId) {
      const { data: itemRows, error: itemError } = await admin
        .from("order_items")
        .select("product_id,product_name,quantity,unit_price")
        .eq("order_id", orderId)
        .order("created_at", { ascending: true });
      if (itemError || !itemRows?.length) return { blocked: true };

      const basket: Array<RecoveryBasketLine | null> = itemRows.map((rawItem: unknown) => {
        const item = asRecord(rawItem);
        const unitPriceMinor = moneyToMinor(item?.unit_price);
        const quantity = Number(item?.quantity);
        if (
          unitPriceMinor === null
          || !Number.isInteger(quantity)
          || quantity < 1
        ) {
          return null;
        }
        return {
          productId: String(item?.product_id ?? ""),
          description: String(item?.product_name ?? "Hooma product"),
          quantity,
          unitPriceMinor,
        };
      });
      if (basket.some((item: unknown) => item === null)) {
        return { blocked: true };
      }
      const safeBasket = basket.filter(
        (item): item is RecoveryBasketLine => item !== null,
      );
      const basketMinor = safeBasket.reduce(
        (sum: number, item) => sum + item.unitPriceMinor * item.quantity,
        0,
      );
      if (basketMinor + deliveryMinor !== totalMinor) {
        return { blocked: true };
      }

      const urls = getBogReturnUrls(orderId);
      const payment = await createBogOrder({
        callbackUrl: urls.callbackUrl,
        externalOrderId: attemptId,
        totalMinor,
        basket: safeBasket,
        deliveryMinor,
        ttlMinutes: 15,
        successUrl: urls.successUrl,
        failUrl: urls.failUrl,
        paymentMethods: getBogPaymentMethods(),
      }, checkoutKey, "ka");
      providerOrderId = payment.providerOrderId;
      recoveredRedirect = payment.redirectUrl;
      const { error: bindError } = await admin.rpc(
        "bind_bog_payment_attempt_v1",
        {
          requested_attempt_id: attemptId,
          requested_provider_payment_id: providerOrderId,
          requested_response: payment.safeResponse,
        },
      );
      if (bindError?.message?.includes("BOG_PROVIDER_ID_CONFLICT")) {
        return { blocked: true };
      }
    }

    const receipt = parseBogPaymentDetails(
      await getBogPaymentDetails(providerOrderId),
    );
    if (
      !receipt
      || receipt.orderId !== providerOrderId
      || receipt.externalOrderId !== attemptId
    ) {
      return { blocked: true };
    }
    if (receipt.status === "rejected") {
      if (!await rejectedCatalogReceipt(admin, attemptId, receipt)) {
        return { blocked: true };
      }
      continue;
    }
    if (
      recoveredRedirect
      && ["created", "processing"].includes(receipt.status)
    ) {
      return { blocked: true, redirectUrl: recoveredRedirect, orderId };
    }
    return { blocked: true };
  }
  const { count: remainingCount, error: remainingError } = await admin
    .from("payment_attempts")
    .select("id,orders!inner(customer_id)", { count: "exact", head: true })
    .eq("provider", "bog")
    .in("status", ["created", "pending"])
    .eq("orders.customer_id", customerId)
    .lt("created_at", staleBefore);
  return {
    blocked: Boolean(remainingError || (remainingCount ?? 0) > 0),
  };
}

export async function reconcileCustomerHoomaPlusBogAttempts(
  admin: any,
  customerId: string,
): Promise<RecoveryResult> {
  const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString();
  const { data, error } = await admin
    .from("hooma_plus_payment_attempts")
    .select(
      "id,provider_payment_id,idempotency_key,amount,currency,status,hooma_plus_purchases!inner(id,customer_id,plan_code,amount)",
    )
    .in("status", ["created", "pending"])
    .eq("hooma_plus_purchases.customer_id", customerId)
    .lt("created_at", staleBefore)
    .order("created_at", { ascending: true })
    .limit(STALE_BATCH_SIZE);

  if (error) return { blocked: true };
  for (const raw of data ?? []) {
    const attempt = asRecord(raw);
    const purchase = relationOne(attempt?.hooma_plus_purchases);
    const attemptId = typeof attempt?.id === "string" ? attempt.id : "";
    const purchaseId = typeof purchase?.id === "string" ? purchase.id : "";
    const planCode = purchase?.plan_code === "annual" ? "annual" : "monthly";
    const checkoutKey = typeof attempt?.idempotency_key === "string"
      ? attempt.idempotency_key
      : "";
    const totalMinor = moneyToMinor(attempt?.amount);
    if (!attemptId || !purchaseId || !checkoutKey || totalMinor === null) {
      return { blocked: true };
    }

    let providerOrderId = typeof attempt?.provider_payment_id === "string"
      ? attempt.provider_payment_id
      : "";
    let recoveredRedirect = "";
    if (!providerOrderId) {
      const urls = getBogHoomaPlusReturnUrls(purchaseId);
      const payment = await createBogOrder({
        callbackUrl: urls.callbackUrl,
        externalOrderId: attemptId,
        totalMinor,
        basket: [{
          productId: `hooma-plus-${planCode}`,
          description: planCode === "annual"
            ? "Hooma+ Annual Membership"
            : "Hooma+ Monthly Membership",
          quantity: 1,
          unitPriceMinor: totalMinor,
        }],
        ttlMinutes: 15,
        successUrl: urls.successUrl,
        failUrl: urls.failUrl,
        paymentMethods: getBogPaymentMethods(),
      }, checkoutKey, "ka");
      providerOrderId = payment.providerOrderId;
      recoveredRedirect = payment.redirectUrl;
      const { error: bindError } = await admin.rpc(
        "bind_bog_hooma_plus_attempt_v1",
        {
          requested_attempt_id: attemptId,
          requested_provider_payment_id: providerOrderId,
          requested_response: payment.safeResponse,
        },
      );
      if (
        bindError?.message?.includes("HOOMA_PLUS_PROVIDER_ID_CONFLICT")
      ) {
        return { blocked: true };
      }
    }

    const receipt = parseBogPaymentDetails(
      await getBogPaymentDetails(providerOrderId),
    );
    if (
      !receipt
      || receipt.orderId !== providerOrderId
      || receipt.externalOrderId !== attemptId
    ) {
      return { blocked: true };
    }
    if (receipt.status === "rejected") {
      if (!await rejectedMembershipReceipt(admin, attemptId, receipt)) {
        return { blocked: true };
      }
      continue;
    }
    if (
      recoveredRedirect
      && ["created", "processing"].includes(receipt.status)
    ) {
      return { blocked: true, redirectUrl: recoveredRedirect };
    }
    return { blocked: true };
  }
  const { count: remainingCount, error: remainingError } = await admin
    .from("hooma_plus_payment_attempts")
    .select(
      "id,hooma_plus_purchases!inner(customer_id)",
      { count: "exact", head: true },
    )
    .in("status", ["created", "pending"])
    .eq("hooma_plus_purchases.customer_id", customerId)
    .lt("created_at", staleBefore);
  return {
    blocked: Boolean(remainingError || (remainingCount ?? 0) > 0),
  };
}
