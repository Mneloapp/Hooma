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
import {
  bindCheckoutPaymentOrder,
  clearCheckoutPaymentSessionForOrder,
  readCheckoutPaymentSessionPointer,
} from "../components/checkout/payment-session-storage.ts";

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

test("BOG delivery amount and TTL are included in the exact full charge", () => {
  const payload = buildBogCreateOrderPayload({
    callbackUrl: "https://hooma.ge/api/payments/bog/callback",
    externalOrderId: "attempt",
    totalMinor: 1_500,
    basket: [{ productId: "product-1", description: "Product", quantity: 1, unitPriceMinor: 1_000 }],
    deliveryMinor: 500,
    ttlMinutes: 15,
    successUrl: "https://hooma.ge/checkout/result",
    failUrl: "https://hooma.ge/checkout/result",
    paymentMethods: ["card"],
  });
  assert.equal(payload.purchase_units.total_amount, 15);
  assert.deepEqual(payload.purchase_units.delivery, { amount: 5 });
  assert.equal(payload.ttl, 15);
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

test("browser payment idempotency stores only a SHA-256 fingerprint", () => {
  const storage = readFileSync(
    new URL("../components/checkout/payment-session-storage.ts", import.meta.url),
    "utf8",
  );
  const checkout = readFileSync(
    new URL("../components/checkout/CheckoutForm.tsx", import.meta.url),
    "utf8",
  );
  assert.match(storage, /subtle\.digest\("SHA-256"/);
  assert.match(storage, /fingerprintSha256/);
  assert.doesNotMatch(storage, /\bfingerprint:\s*string/);
  assert.match(checkout, /sha256CheckoutFingerprint\(JSON\.stringify\(/);
});

test("delayed paid callbacks reconcile only their tracked cart quantities", () => {
  const action = readFileSync(
    new URL("../app/auth/actions.ts", import.meta.url),
    "utf8",
  );
  const checkout = readFileSync(
    new URL("../components/checkout/CheckoutForm.tsx", import.meta.url),
    "utf8",
  );
  const result = readFileSync(
    new URL("../components/checkout/PaymentResultAutoRefresh.tsx", import.meta.url),
    "utf8",
  );
  const provider = readFileSync(
    new URL("../components/CartContext.tsx", import.meta.url),
    "utf8",
  );

  assert.match(action, /redirectUrl: payment\.redirectUrl,\s+orderId,/);
  assert.match(action, /ok: true;\s+message: string;\s+redirectUrl: string;\s+orderId: string;/);
  assert.match(checkout, /trackPendingPaymentOrder\(result\.orderId\)/);
  assert.match(checkout, /bindCheckoutPaymentOrder\(result\.orderId\)/);
  assert.match(checkout, /if \(!uuidPattern\.test\(result\.orderId\)\) \{[\s\S]*?return;[\s\S]*?window\.location\.assign\(result\.redirectUrl\)/);
  assert.match(provider, /\.select\("id,payment_status"\)/);
  assert.match(provider, /\.select\("product_id,variant_id,material,color,quantity"\)/);
  assert.match(provider, /reconcilePaymentOrder\(/);
  assert.doesNotMatch(result, /clearCart\(\)/);
  assert.doesNotMatch(result, /return=success/);
});

test("historical result URLs cannot register or consume a current cart", () => {
  const result = readFileSync(
    new URL("../components/checkout/PaymentResultAutoRefresh.tsx", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(result, /trackPendingPaymentOrder/);
  assert.doesNotMatch(result, /bindCheckoutPaymentOrder/);
  assert.doesNotMatch(result, /reconcilePaymentOrder/);
  assert.doesNotMatch(result, /purchasedLines/);
});

test("checkout never navigates to BOG without a valid server order id", () => {
  const checkout = readFileSync(
    new URL("../components/checkout/CheckoutForm.tsx", import.meta.url),
    "utf8",
  );
  const guard = checkout.indexOf("if (!uuidPattern.test(result.orderId))");
  const tracking = checkout.indexOf("trackPendingPaymentOrder(result.orderId)");
  const navigation = checkout.indexOf("window.location.assign(result.redirectUrl)");

  assert.ok(guard >= 0);
  assert.ok(tracking > guard);
  assert.ok(navigation > tracking);
  assert.match(checkout.slice(guard, tracking), /return;/);
});

test("an older order cannot overwrite or clear a newer checkout session", () => {
  const storageKey = "hooma-bog-checkout-session-v2";
  const orderA = "00000000-0000-4000-8000-000000000001";
  const orderB = "00000000-0000-4000-8000-000000000002";
  const values = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };

  try {
    values.set(storageKey, JSON.stringify({
      version: 2,
      fingerprintSha256: "a".repeat(64),
      checkoutKey: "00000000-0000-4000-8000-000000000003",
      orderId: orderB,
    }));

    assert.equal(bindCheckoutPaymentOrder(orderA), false);
    assert.equal(clearCheckoutPaymentSessionForOrder(orderA), false);
    assert.equal(JSON.parse(values.get(storageKey)).orderId, orderB);
    assert.equal(clearCheckoutPaymentSessionForOrder(orderB), true);
    assert.equal(values.has(storageKey), false);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("legacy checkout sessions expose only their validated recovery pointer", () => {
  const storageKey = "hooma-bog-checkout-session-v2";
  const checkoutKey = "00000000-0000-4000-8000-000000000003";
  const values = new Map();
  const originalWindow = globalThis.window;
  globalThis.window = {
    sessionStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  };

  try {
    values.set(storageKey, JSON.stringify({
      version: 2,
      fingerprintSha256: "b".repeat(64),
      checkoutKey,
    }));
    assert.deepEqual(readCheckoutPaymentSessionPointer(), { checkoutKey });
    values.set(storageKey, JSON.stringify({
      version: 2,
      fingerprintSha256: "not-a-hash",
      checkoutKey,
    }));
    assert.equal(readCheckoutPaymentSessionPointer(), null);
  } finally {
    if (originalWindow === undefined) delete globalThis.window;
    else globalThis.window = originalWindow;
  }
});

test("legacy cart recovery is bound to the authenticated customer's exact checkout", () => {
  const action = readFileSync(
    new URL("../app/auth/actions.ts", import.meta.url),
    "utf8",
  );
  const provider = readFileSync(
    new URL("../components/CartContext.tsx", import.meta.url),
    "utf8",
  );

  assert.match(action, /recoverCatalogPaymentSessionAction/);
  assert.match(action, /supabase\.auth\.getUser\(\)/);
  assert.match(action, /\.eq\("idempotency_key", checkoutKey\)/);
  assert.match(action, /\.eq\("orders\.customer_id", customer\.id\)/);
  assert.match(action, /\.eq\("orders\.test_mode", false\)/);
  assert.match(action, /Date\.now\(\) - 7 \* 24 \* 60 \* 60 \* 1000/);
  assert.doesNotMatch(action, /\.order\("created_at"[\s\S]*recoverCatalogPaymentSessionAction/);
  assert.match(provider, /readCheckoutPaymentSessionPointer\(\)/);
  assert.match(provider, /recoverCatalogPaymentSessionAction\(session\.checkoutKey\)/);
  assert.match(provider, /session\.orderId && session\.orderId !== result\.orderId/);
  assert.match(provider, /attempts < 3/);
  assert.match(provider, /recoveredCheckoutKeysRef\.current\.delete\(recoveryKey\)/);
  assert.match(provider, /cartMatchesPurchasedLinesExactly/);
  assert.match(provider, /!alreadyTracked && !legacyCartIsUnchanged/);
  assert.doesNotMatch(provider, /if \(session\.orderId\) \{\s*trackPendingPaymentOrder/);
  assert.match(provider, /bindCheckoutPaymentOrder\(result\.orderId\)/);
  assert.match(provider, /trackPendingPaymentOrder\(result\.orderId\)/);
  assert.match(provider, /reconcilePaymentOrder\(\{/);
});

test("account orders shows an accessible colored payment and fulfillment timeline", () => {
  const page = readFileSync(
    new URL("../app/account/orders/page.tsx", import.meta.url),
    "utf8",
  );

  for (const key of [
    "payment_confirmed",
    "order_received",
    "production_started",
    "quality_check",
    "ready_for_delivery",
    "out_for_delivery",
    "delivered",
  ]) {
    assert.match(page, new RegExp(`key: ["']${key}["']`));
  }

  assert.match(page, /order_received:\s*1/);
  assert.match(page, /production_queued:\s*2/);
  assert.match(page, /in_production:\s*2/);
  assert.match(page, /quality_check:\s*3/);
  assert.match(page, /ready_for_delivery:\s*4/);
  assert.match(page, /out_for_delivery:\s*5/);
  assert.match(page, /delivered:\s*6/);
  assert.match(page, /border-emerald-200 bg-emerald-50/);
  assert.match(page, /border-sky-400 bg-sky-50[\s\S]*font-bold text-sky-950/);
  assert.match(page, /payment_status === ["']paid["'][\s\S]*border-emerald-200 bg-emerald-50 text-emerald-900/);
  assert.match(page, /aria-current=\{isCurrent \? ["']step["'] : undefined\}/);
  assert.match(page, /snap-x[\s\S]*overflow-x-auto[\s\S]*sm:grid/);
  assert.match(page, /paymentFailed[\s\S]*return ["']failed["']/);
  assert.match(page, /refunded[\s\S]*return ["']refunded["']/);
  assert.match(page, /reviewRequired[\s\S]*return ["']review["']/);
  assert.match(page, /cancelled[\s\S]*შეკვეთა გაუქმებულია/);
  assert.match(page, /timeZone:\s*["']Asia\/Tbilisi["']/);
  assert.match(page, /href=\{`\/product\/\$\{joinedProduct\.slug\}`\}[\s\S]*პროდუქტის ნახვა/);
});

test("account order timestamps render in Tbilisi time", () => {
  const formatted = new Intl.DateTimeFormat("ka-GE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tbilisi",
  }).format(new Date("2026-08-05T13:59:56Z"));

  assert.match(formatted, /17:59/);
});
