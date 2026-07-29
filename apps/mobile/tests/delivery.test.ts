import assert from "node:assert/strict";
import test from "node:test";
import { quoteDeliveryPreview } from "../src/lib/delivery";

test("99.99 GEL keeps the standard 5 GEL fee without benefits", () => {
  assert.deepEqual(
    quoteDeliveryPreview({ subtotalMinor: 9_999, unitCount: 2, summary: { active: false, welcomeUnitsRemaining: 0 } }),
    { deliveryMinor: 500, benefitCode: "standard_fee" },
  );
});

test("100.00 GEL is free", () => {
  assert.equal(quoteDeliveryPreview({ subtotalMinor: 10_000, unitCount: 2 }).deliveryMinor, 0);
});

test("more than 100 GEL is free", () => {
  assert.equal(quoteDeliveryPreview({ subtotalMinor: 10_001, unitCount: 2 }).deliveryMinor, 0);
});

test("Hooma+ is free without consuming welcome units", () => {
  assert.equal(
    quoteDeliveryPreview({ subtotalMinor: 2_000, unitCount: 20, summary: { active: true, welcomeUnitsRemaining: 10 } }).benefitCode,
    "hooma_plus",
  );
});

test("the full cart must fit in remaining welcome units", () => {
  assert.equal(
    quoteDeliveryPreview({ subtotalMinor: 2_000, unitCount: 3, summary: { active: false, welcomeUnitsRemaining: 2 } }).benefitCode,
    "standard_fee",
  );
  assert.equal(
    quoteDeliveryPreview({ subtotalMinor: 2_000, unitCount: 2, summary: { active: false, welcomeUnitsRemaining: 2 } }).benefitCode,
    "welcome_units",
  );
});
