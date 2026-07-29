import assert from "node:assert/strict";
import test from "node:test";
import { parseHoomaDeepLink } from "../src/lib/deep-links";

const id = "11111111-1111-4111-8111-111111111111";

test("accepts Hooma universal payment links", () => {
  assert.deepEqual(
    parseHoomaDeepLink(`https://hooma.ge/mobile/payment/result?order=${id}`),
    { route: "payment_result", orderId: id },
  );
});

test("accepts the hooma auth callback scheme", () => {
  assert.deepEqual(parseHoomaDeepLink("hooma://auth/callback?code=one-time"), { route: "auth_callback" });
});

test("rejects untrusted origins and malformed identifiers", () => {
  assert.equal(parseHoomaDeepLink(`https://evil.example/mobile/payment/result?order=${id}`), null);
  assert.equal(parseHoomaDeepLink("hooma://mobile/payment/result?order=not-a-uuid"), null);
});
