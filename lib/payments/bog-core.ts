import { createHash, createVerify } from "node:crypto";

export const BOG_CALLBACK_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu4RUyAw3+CdkS3ZNILQh
zHI9Hemo+vKB9U2BSabppkKjzjjkf+0Sm76hSMiu/HFtYhqWOESryoCDJoqffY0Q
1VNt25aTxbj068QNUtnxQ7KQVLA+pG0smf+EBWlS1vBEAFbIas9d8c9b9sSEkTrr
TYQ90WIM8bGB6S/KLVoT1a7SnzabjoLc5Qf/SLDG5fu8dH8zckyeYKdRKSBJKvhx
tcBuHV4f7qsynQT+f2UYbESX/TLHwT5qFWZDHZ0YUOUIvb8n7JujVSGZO9/+ll/g
4ZIWhC1MlJgPObDwRkRd8NFOopgxMcMsDIZIoLbWKhHVq67hdbwpAq9K9WMmEhPn
PwIDAQAB
-----END PUBLIC KEY-----`;

export const BOG_FULL_PAYMENT_METHODS = ["card", "google_pay", "apple_pay"] as const;
export type BogPaymentMethod = (typeof BOG_FULL_PAYMENT_METHODS)[number];

export type BogBasketItem = {
  productId: string;
  description: string;
  quantity: number;
  unitPriceMinor: number;
};

export type BogCreateOrderInput = {
  callbackUrl: string;
  externalOrderId: string;
  totalMinor: number;
  basket: BogBasketItem[];
  successUrl: string;
  failUrl: string;
  paymentMethods: BogPaymentMethod[];
};

export type BogPaymentDetails = {
  orderId: string;
  externalOrderId: string;
  capture: string;
  status: string;
  currency: string;
  requestAmountMinor: number | null;
  transferAmountMinor: number | null;
  refundAmountMinor: number | null;
  paymentMethod: string | null;
  paymentOption: string | null;
  transactionId: string | null;
  responseCode: string | null;
  responseDescription: string | null;
  rejectReason: string | null;
  hasSplit: boolean;
};

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const asNonEmptyString = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export function moneyToMinor(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const normalized = String(value).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, fraction = ""] = normalized.split(".");
  const minor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
  return Number.isSafeInteger(minor) ? minor : null;
}

export function minorToAmount(minor: number): number {
  if (!Number.isSafeInteger(minor) || minor < 0) throw new Error("Invalid money amount");
  return minor / 100;
}

export function buildBogCreateOrderPayload(input: BogCreateOrderInput) {
  if (!Number.isSafeInteger(input.totalMinor) || input.totalMinor <= 0) {
    throw new Error("BOG total must be a positive integer amount in minor units");
  }
  if (!input.basket.length || input.basket.length > 100) {
    throw new Error("BOG basket must contain between 1 and 100 items");
  }
  if (!input.paymentMethods.length || input.paymentMethods.some((method) => !BOG_FULL_PAYMENT_METHODS.includes(method))) {
    throw new Error("BOG payment method is not allowed");
  }

  const basketTotal = input.basket.reduce((sum, item) => {
    if (!item.productId || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) {
      throw new Error("Invalid BOG basket item");
    }
    if (!Number.isSafeInteger(item.unitPriceMinor) || item.unitPriceMinor <= 0) {
      throw new Error("Invalid BOG basket price");
    }
    return sum + item.unitPriceMinor * item.quantity;
  }, 0);
  if (basketTotal !== input.totalMinor) throw new Error("BOG basket total does not match the order total");

  return {
    application_type: "web" as const,
    callback_url: input.callbackUrl,
    external_order_id: input.externalOrderId,
    capture: "automatic" as const,
    purchase_units: {
      currency: "GEL" as const,
      total_amount: minorToAmount(input.totalMinor),
      basket: input.basket.map((item) => ({
        product_id: item.productId,
        description: item.description.trim().slice(0, 255),
        quantity: item.quantity,
        unit_price: minorToAmount(item.unitPriceMinor),
      })),
    },
    redirect_urls: {
      success: input.successUrl,
      fail: input.failUrl,
    },
    payment_method: [...new Set(input.paymentMethods)],
  };
}

export function parseBogPaymentDetails(value: unknown): BogPaymentDetails | null {
  const root = asRecord(value);
  const status = asRecord(root?.order_status);
  const units = asRecord(root?.purchase_units);
  const paymentDetail = asRecord(root?.payment_detail);
  const transferMethod = asRecord(paymentDetail?.transfer_method);
  const orderId = asNonEmptyString(root?.order_id);
  const externalOrderId = asNonEmptyString(root?.external_order_id);
  const capture = asNonEmptyString(root?.capture);
  const statusKey = asNonEmptyString(status?.key);
  const currency = asNonEmptyString(units?.currency_code);
  if (!orderId || !externalOrderId || !capture || !statusKey || !currency) return null;

  return {
    orderId,
    externalOrderId,
    capture,
    status: statusKey,
    currency: currency.toUpperCase(),
    requestAmountMinor: moneyToMinor(units?.request_amount),
    transferAmountMinor: moneyToMinor(units?.transfer_amount),
    refundAmountMinor: moneyToMinor(units?.refund_amount),
    paymentMethod: asNonEmptyString(transferMethod?.key),
    paymentOption: asNonEmptyString(paymentDetail?.payment_option),
    transactionId: asNonEmptyString(paymentDetail?.transaction_id),
    responseCode: asNonEmptyString(paymentDetail?.code),
    responseDescription: asNonEmptyString(paymentDetail?.code_description),
    rejectReason: asNonEmptyString(root?.reject_reason),
    hasSplit: root?.split !== null && root?.split !== undefined,
  };
}

export function sanitizeBogPaymentDetails(details: BogPaymentDetails) {
  return {
    order_id: details.orderId,
    external_order_id: details.externalOrderId,
    capture: details.capture,
    order_status: details.status,
    currency: details.currency,
    request_amount_minor: details.requestAmountMinor,
    transfer_amount_minor: details.transferAmountMinor,
    refund_amount_minor: details.refundAmountMinor,
    payment_method: details.paymentMethod,
    payment_option: details.paymentOption,
    transaction_id: details.transactionId,
    response_code: details.responseCode,
    response_description: details.responseDescription,
    reject_reason: details.rejectReason,
    has_split: details.hasSplit,
  };
}

export function sha256Hex(value: Buffer | string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function verifyBogCallbackSignature(
  rawBody: Buffer,
  signature: string,
  publicKey = BOG_CALLBACK_PUBLIC_KEY,
): boolean {
  const normalized = signature.trim();
  if (!normalized || normalized.length > 4096 || !/^[A-Za-z0-9+/]+={0,2}$/.test(normalized)) return false;
  try {
    const signatureBytes = Buffer.from(normalized, "base64");
    if (!signatureBytes.length || signatureBytes.toString("base64") !== normalized) return false;
    const verifier = createVerify("RSA-SHA256");
    verifier.update(rawBody);
    verifier.end();
    return verifier.verify(publicKey, signatureBytes);
  } catch {
    return false;
  }
}

export function isAllowedBogPaymentMethod(value: string | null): value is BogPaymentMethod {
  return value !== null && BOG_FULL_PAYMENT_METHODS.includes(value as BogPaymentMethod);
}

export function isTrustedBogRedirect(value: unknown): value is string {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "payment.bog.ge";
  } catch {
    return false;
  }
}
