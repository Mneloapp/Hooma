import assert from "node:assert/strict";
import test from "node:test";
import { createProductAuditorFromEnv, isCatalogAuditPerProductMediaError } from "./product-auditor.mjs";

const product = {
  nameKa: "სანათი",
  nameEn: "Lamp",
  descriptionKa: "მაგიდის დეკორატიული სანათი.",
  descriptionEn: "A decorative table lamp.",
  category: "Lighting",
  images: ["https://example.com/product.jpg"],
  variant: { sizeLabel: "Standard", dimensions: null, colorMode: "customer_choice", colors: ["თეთრი"] },
};

test("classifies an upstream file download 502 as a per-product media error", () => {
  assert.equal(isCatalogAuditPerProductMediaError("Error while downloading file. Upstream status code: 502."), true);
});

test("classifies supported image error codes as per-product errors", () => {
  assert.equal(isCatalogAuditPerProductMediaError("Invalid input", "invalid_image_url"), true);
  assert.equal(isCatalogAuditPerProductMediaError("Image is too large", "image_too_large"), true);
});

test("keeps credentials, quota, and schema errors systemic", () => {
  assert.equal(isCatalogAuditPerProductMediaError("Incorrect API key provided", "invalid_api_key"), false);
  assert.equal(isCatalogAuditPerProductMediaError("You exceeded your current quota", "insufficient_quota"), false);
  assert.equal(isCatalogAuditPerProductMediaError("Invalid schema for response_format", "invalid_request_error"), false);
});

test("does not retry a paid request and wires media failures as non-fatal", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: { message: "Error while downloading file. Upstream status code: 502.", code: "invalid_value" },
    }), { status: 400, headers: { "content-type": "application/json" } });
  };
  const audit = createProductAuditorFromEnv({ OPENAI_API_KEY: "sk-test" });
  await assert.rejects(audit(product), (error) => {
    assert.equal(error.catalogAuditFatal, false);
    assert.equal(error.catalogAuditCountsTowardCircuitBreaker, false);
    assert.equal(error.catalogAuditPerProductMedia, true);
    return true;
  });
  assert.equal(calls, 1);
});

test("keeps an authentication response fatal", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => { globalThis.fetch = originalFetch; });
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return new Response(JSON.stringify({
      error: { message: "Incorrect API key provided", code: "invalid_api_key" },
    }), { status: 401, headers: { "content-type": "application/json" } });
  };
  const audit = createProductAuditorFromEnv({ OPENAI_API_KEY: "sk-test" });
  await assert.rejects(audit(product), (error) => {
    assert.equal(error.catalogAuditFatal, true);
    assert.equal(error.catalogAuditCountsTowardCircuitBreaker, true);
    assert.equal(error.catalogAuditPerProductMedia, false);
    return true;
  });
  assert.equal(calls, 1);
});
