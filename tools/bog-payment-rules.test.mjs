import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  buildBogCreateOrderPayload,
  moneyToMinor,
  parseBogPaymentDetails,
  sanitizeBogPaymentDetails,
  verifyBogCallbackSignature,
} from "../lib/payments/bog-core.ts";

test("BOG order payload permits only automatic full payment", () => {
  const payload = buildBogCreateOrderPayload({
    callbackUrl: "https://hooma.ge/api/payments/bog/callback",
    externalOrderId: "af30899d-81a1-4d1e-a574-e519235d00d6",
    totalMinor: 5050,
    basket: [
      { productId: "product-1", description: "Hooma product", quantity: 2, unitPriceMinor: 2525 },
    ],
    successUrl: "https://hooma.ge/checkout/result?return=success",
    failUrl: "https://hooma.ge/checkout/result?return=fail",
    paymentMethods: ["card", "google_pay", "apple_pay"],
  });

  assert.equal(payload.capture, "automatic");
  assert.equal(payload.purchase_units.currency, "GEL");
  assert.equal(payload.purchase_units.total_amount, 50.5);
  assert.deepEqual(payload.payment_method, ["card", "google_pay", "apple_pay"]);
  assert.equal("config" in payload, false);
  assert.equal(JSON.stringify(payload).includes("bog_loan"), false);
  assert.equal(JSON.stringify(payload).includes("bnpl"), false);
  assert.equal(JSON.stringify(payload).includes("split"), false);
  assert.equal(JSON.stringify(payload).includes("manual"), false);
});

test("BOG order payload rejects a mismatched basket amount", () => {
  assert.throws(() => buildBogCreateOrderPayload({
    callbackUrl: "https://hooma.ge/api/payments/bog/callback",
    externalOrderId: "attempt",
    totalMinor: 1001,
    basket: [{ productId: "product-1", description: "Product", quantity: 1, unitPriceMinor: 1000 }],
    successUrl: "https://hooma.ge/checkout/result",
    failUrl: "https://hooma.ge/checkout/result",
    paymentMethods: ["card"],
  }), /does not match/);
});

test("money conversion is exact to two decimal places", () => {
  assert.equal(moneyToMinor("100.50"), 10050);
  assert.equal(moneyToMinor(25.3), 2530);
  assert.equal(moneyToMinor("1.001"), null);
  assert.equal(moneyToMinor(-1), null);
});

test("callback signature covers the untouched raw body", () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const raw = Buffer.from('{"event":"order_payment","body":{"a":1,"b":2}}');
  const signature = sign("RSA-SHA256", raw, privateKey).toString("base64");
  const pem = publicKey.export({ type: "spki", format: "pem" }).toString();

  assert.equal(verifyBogCallbackSignature(raw, signature, pem), true);
  assert.equal(
    verifyBogCallbackSignature(Buffer.from('{"body":{"b":2,"a":1},"event":"order_payment"}'), signature, pem),
    false,
  );
  assert.equal(verifyBogCallbackSignature(raw, "not base64!", pem), false);
});

test("receipt parser keeps reconciliation fields and drops card data", () => {
  const receipt = {
    order_id: "bog-order",
    external_order_id: "attempt-id",
    capture: "automatic",
    order_status: { key: "completed", value: "Completed" },
    purchase_units: {
      request_amount: "100.50",
      transfer_amount: "100.50",
      refund_amount: "0.00",
      currency_code: "GEL",
    },
    payment_detail: {
      transfer_method: { key: "card", value: "Card" },
      payment_option: "direct_debit",
      transaction_id: "transaction-id",
      payer_identifier: "411111xxxxxx1111",
      card_expiry_date: "12/30",
      code: "100",
      code_description: "Successful payment",
    },
    buyer: { full_name: "Private customer", email: "private@example.com" },
    split: null,
    reject_reason: null,
  };
  const parsed = parseBogPaymentDetails(receipt);
  assert.ok(parsed);
  assert.equal(parsed.requestAmountMinor, 10050);
  assert.equal(parsed.transferAmountMinor, 10050);
  assert.equal(parsed.paymentOption, "direct_debit");

  const safe = sanitizeBogPaymentDetails(parsed);
  const serialized = JSON.stringify(safe);
  assert.equal(serialized.includes("payer_identifier"), false);
  assert.equal(serialized.includes("card_expiry"), false);
  assert.equal(serialized.includes("private@example.com"), false);
});

test("database payment mutations are service-only and never queue printing", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260729001000_bog_full_payments.sql", import.meta.url),
    "utf8",
  );
  assert.match(migration, /grant execute on function public\.begin_bog_checkout_v1[\s\S]*to service_role;/);
  assert.match(migration, /grant execute on function public\.apply_bog_payment_result_v1[\s\S]*to service_role;/);
  assert.match(migration, /grant execute on function public\.record_bog_reconciliation_review_v1[\s\S]*to service_role;/);
  assert.match(migration, /requested_capture <> 'automatic'/);
  assert.match(migration, /requested_payment_option is distinct from 'direct_debit'/);
  assert.match(migration, /requested_has_split is true/);
  assert.match(migration, /requested_payment_method not in \('card', 'google_pay', 'apple_pay'\)/);
  assert.match(migration, /round\(requested_transfer_amount, 2\) <> round\(attempt_record\.amount, 2\)/);
  assert.match(migration, /unique\(provider, payload_sha256, receipt_state_sha256\)/);
  assert.match(migration, /resolved_items jsonb/);
  assert.match(migration, /from jsonb_to_recordset\(resolved_items\)/);
  assert.match(migration, /only the signature-verified callback function above can do so/i);
  assert.equal(migration.includes("insert into public.print_jobs"), false);
});

test("callback verifies raw bytes before deserializing JSON", () => {
  const route = readFileSync(
    new URL("../app/api/payments/bog/callback/route.ts", import.meta.url),
    "utf8",
  );
  const verification = route.indexOf("verifyBogCallbackSignature(rawBody");
  const deserialization = route.indexOf("JSON.parse(rawBody.toString");
  assert.ok(verification >= 0);
  assert.ok(deserialization > verification);
  assert.match(route, /getBogPaymentDetails\(callbackOrderId\)/);
  assert.match(route, /request\.body\?\.getReader\(\)/);
  assert.doesNotMatch(route, /payment_status\s*[:=]\s*["']paid["']/);
});

test("admin receipt recovery can hold anomalies but cannot mark paid", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260729001000_bog_full_payments.sql", import.meta.url),
    "utf8",
  );
  const recovery = migration.slice(
    migration.indexOf("create or replace function public.record_bog_reconciliation_review_v1"),
  );
  assert.match(recovery, /failure_code := 'UNSUPPORTED_PROVIDER_STATUS'/);
  assert.match(recovery, /order_record\.payment_status = 'paid'/);
  assert.match(recovery, /set payment_status = 'review_required'/);
  assert.doesNotMatch(recovery, /set payment_status = 'paid'/);
  assert.match(recovery, /'bog_payment_receipt_reconciled'/);
  assert.match(recovery, /BOG_RECONCILIATION_IDEMPOTENCY_CONFLICT/);
  assert.match(recovery, /pg_advisory_xact_lock/);
  assert.match(recovery, /existing_event\.processing_status = 'manual_review'/);
});
