import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isOwnedUploadPath,
  readBearerToken,
} from "../lib/mobile-api/security.ts";

test("mobile API accepts only a strict Bearer token", () => {
  assert.equal(readBearerToken(new Request("https://hooma.ge", {
    headers: { authorization: "Bearer header.payload.signature" },
  })), "header.payload.signature");
  assert.equal(readBearerToken(new Request("https://hooma.ge", {
    headers: { authorization: "Basic abc" },
  })), "");
  assert.equal(readBearerToken(new Request("https://hooma.ge", {
    headers: { authorization: "Bearer token with spaces" },
  })), "");
});

test("custom-order paths must remain under the authenticated owner and request", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const request = "22222222-2222-4222-8222-222222222222";
  assert.equal(isOwnedUploadPath(user, request, `${user}/${request}/file.stl`), true);
  assert.equal(isOwnedUploadPath(user, request, `other/${request}/file.stl`), false);
  assert.equal(isOwnedUploadPath(user, request, `${user}/${request}/../secret.stl`), false);
});

test("mobile checkout remains server-authoritative and rejects a changed client total", () => {
  const checkout = readFileSync(
    new URL("../lib/commerce/catalog-checkout-service.ts", import.meta.url),
    "utf8",
  );
  assert.match(checkout, /resolve_catalog_price/);
  assert.match(checkout, /get_hooma_plus_summary_for_customer_v1/);
  assert.match(checkout, /input\.expected_total_minor !== quote\.totalMinor/);
  assert.match(checkout, /requested_expected_total: minorToAmount\(quote\.totalMinor\)/);
  assert.match(checkout, /\.eq\("products\.production_status", "approved"\)/);
  assert.match(checkout, /catalog_audit_applied_at/);
});

test("a mobile success link only polls the owned server order status", () => {
  const resultScreen = readFileSync(
    new URL("../apps/mobile/app/mobile/payment/result.tsx", import.meta.url),
    "utf8",
  );
  const statusRoute = readFileSync(
    new URL("../app/api/mobile/v1/checkout/status/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(resultScreen, /api\/mobile\/v1\/checkout\/status/);
  assert.doesNotMatch(resultScreen, /method:\s*"(?:POST|PATCH|PUT|DELETE)"/);
  assert.match(statusRoute, /requireMobileAuth\(request\)/);
  assert.match(statusRoute, /\.eq\("customer_id", auth\.customerId\)/);
});

test("failed payment recovery releases benefits only after a rejected provider receipt", () => {
  const recovery = readFileSync(
    new URL("../lib/payments/bog-stale-recovery.ts", import.meta.url),
    "utf8",
  );
  assert.match(recovery, /getBogPaymentDetails\(providerOrderId\)/);
  assert.match(recovery, /receipt\.status === "rejected"/);
  assert.match(recovery, /release_rejected_bog_delivery_reservation_v1/);
});

test("uploaded custom-order files are checked for owner, actual size, and stored MIME type", () => {
  const route = readFileSync(
    new URL("../app/api/mobile/v1/custom-orders/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /isOwnedUploadPath/);
  assert.match(route, /actualSize !== expectedSize/);
  assert.match(route, /metadata\?\.mimetype/);
});
