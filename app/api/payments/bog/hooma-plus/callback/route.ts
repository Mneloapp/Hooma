import { NextResponse } from "next/server";
import {
  minorToAmount,
  parseBogPaymentDetails,
  sanitizeBogPaymentDetails,
  sha256Hex,
  verifyBogCallbackSignature,
} from "@/lib/payments/bog-core";
import {
  BogPaymentError,
  getBogCallbackPublicKey,
  getBogPaymentDetails,
} from "@/lib/payments/bog";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_CALLBACK_BYTES = 256 * 1024;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const json = (body: Record<string, unknown>, status: number) =>
  NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const amountOrNull = (minor: number | null) =>
  minor === null ? null : minorToAmount(minor);

async function readBoundedBody(request: Request): Promise<Buffer | null> {
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Buffer[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_CALLBACK_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks, total);
}

export async function POST(request: Request) {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_CALLBACK_BYTES) {
    return json({ received: false }, 413);
  }

  const rawBody = await readBoundedBody(request);
  if (rawBody === null) return json({ received: false }, 413);
  if (!rawBody.length) return json({ received: false }, 400);

  const signature = request.headers.get("Callback-Signature");
  if (!signature || !verifyBogCallbackSignature(rawBody, signature, getBogCallbackPublicKey())) {
    return json({ received: false }, 401);
  }

  let callback: Record<string, unknown>;
  try {
    callback = JSON.parse(rawBody.toString("utf8")) as Record<string, unknown>;
  } catch {
    return json({ received: false }, 400);
  }

  const callbackBody = asRecord(callback.body);
  const callbackOrderId = typeof callbackBody?.order_id === "string"
    ? callbackBody.order_id.trim()
    : "";
  const event = typeof callback.event === "string" ? callback.event : "";
  if (event !== "order_payment" || !callbackOrderId || callbackOrderId.length > 128) {
    return json({ received: false }, 400);
  }

  const admin = createAdminClient() as any;
  if (!admin) return json({ received: false }, 503);

  try {
    // A valid raw signature proves callback provenance. The freshly fetched
    // receipt is still the authority for status, amount, currency and method.
    const receipt = await getBogPaymentDetails(callbackOrderId);
    const details = parseBogPaymentDetails(receipt);
    if (!details || details.orderId !== callbackOrderId || !uuidPattern.test(details.externalOrderId)) {
      return json({ received: false }, 502);
    }

    const rawEventAt = typeof callback.zoned_request_time === "string"
      ? callback.zoned_request_time
      : null;
    const parsedEventAt = rawEventAt && !Number.isNaN(Date.parse(rawEventAt))
      ? new Date(rawEventAt).toISOString()
      : null;
    const safePayload = sanitizeBogPaymentDetails(details);
    const { data, error } = await admin.rpc("apply_bog_hooma_plus_result_v1", {
      requested_attempt_id: details.externalOrderId,
      requested_provider_payment_id: details.orderId,
      requested_external_order_id: details.externalOrderId,
      requested_payload_sha256: sha256Hex(rawBody),
      requested_event_at: parsedEventAt,
      requested_provider_status: details.status,
      requested_capture: details.capture,
      requested_currency: details.currency,
      requested_request_amount: amountOrNull(details.requestAmountMinor),
      requested_transfer_amount: amountOrNull(details.transferAmountMinor),
      requested_refund_amount: amountOrNull(details.refundAmountMinor),
      requested_payment_method: details.paymentMethod,
      requested_payment_option: details.paymentOption,
      requested_transaction_id: details.transactionId,
      requested_has_split: details.hasSplit,
      requested_safe_payload: safePayload,
    });
    if (error) {
      console.error("BOG_HOOMA_PLUS_CALLBACK_RECONCILIATION_FAILED", {
        providerOrderId: details.orderId,
        code: error.code ?? null,
      });
      return json({ received: false }, 503);
    }

    const result = asRecord(data);
    if (result?.processing_status === "manual_review") {
      console.error("BOG_HOOMA_PLUS_CALLBACK_REQUIRES_REVIEW", {
        providerOrderId: details.orderId,
        reason: result.failure_reason ?? null,
      });
    }
    return json({ received: true }, 200);
  } catch (error) {
    const retryable = error instanceof BogPaymentError ? error.retryable : true;
    console.error("BOG_HOOMA_PLUS_CALLBACK_RECEIPT_FAILED", {
      providerOrderId: callbackOrderId,
      retryable,
    });
    return json({ received: false }, retryable ? 503 : 502);
  }
}
