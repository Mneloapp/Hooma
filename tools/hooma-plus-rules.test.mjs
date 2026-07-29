import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  DELIVERY_POLICY,
  quoteCatalogDelivery,
} from "../lib/commerce/hooma-plus.ts";

const summary = (overrides = {}) => ({
  active: false,
  activeUntil: null,
  welcomeUnitsTotal: 10,
  welcomeUnitsConsumed: 0,
  welcomeUnitsReserved: 0,
  welcomeUnitsRemaining: 10,
  ...overrides,
});

test("delivery rules use Hooma+, free from 100, welcome units, then 5 GEL", () => {
  assert.equal(quoteCatalogDelivery({
    subtotalMinor: 1_000,
    unitCount: 20,
    summary: summary({ active: true }),
  }).benefitCode, "hooma_plus");

  const exactlyOneHundred = quoteCatalogDelivery({
    subtotalMinor: 10_000,
    unitCount: 20,
    summary: summary({ welcomeUnitsRemaining: 0 }),
  });
  assert.equal(exactlyOneHundred.benefitCode, "subtotal_threshold");
  assert.equal(exactlyOneHundred.deliveryMinor, 0);
  assert.equal(exactlyOneHundred.amountUntilFreeDeliveryMinor, 0);

  const oneCentBelow = quoteCatalogDelivery({
    subtotalMinor: 9_999,
    unitCount: 1,
    summary: summary({ welcomeUnitsRemaining: 0 }),
  });
  assert.equal(oneCentBelow.benefitCode, "standard_fee");
  assert.equal(oneCentBelow.deliveryMinor, 500);
  assert.equal(oneCentBelow.amountUntilFreeDeliveryMinor, 1);

  const welcome = quoteCatalogDelivery({
    subtotalMinor: 2_000,
    unitCount: 4,
    summary: summary({ welcomeUnitsRemaining: 4 }),
  });
  assert.equal(welcome.benefitCode, "welcome_units");
  assert.equal(welcome.deliveryMinor, 0);
  assert.equal(welcome.welcomeUnitsToReserve, 4);

  const tooManyUnits = quoteCatalogDelivery({
    subtotalMinor: 2_000,
    unitCount: 4,
    summary: summary({ welcomeUnitsRemaining: 3 }),
  });
  assert.equal(tooManyUnits.benefitCode, "standard_fee");
  assert.equal(tooManyUnits.welcomeUnitsToReserve, 0);
  assert.equal(tooManyUnits.welcomeUnitsRemainingAfterPayment, 3);
  assert.equal(DELIVERY_POLICY.welcomeUnits, 10);
});

test("migration keeps delivery and Hooma+ payment decisions server-authoritative", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260729001100_hooma_plus_delivery.sql", import.meta.url),
    "utf8",
  );
  const inclusiveThresholdMigration = readFileSync(
    new URL("../supabase/migrations/20260729001200_hooma_plus_free_from_100.sql", import.meta.url),
    "utf8",
  );
  assert.match(
    inclusiveThresholdMigration,
    /created_order\.subtotal >= settings_record\.free_above_subtotal/,
  );
  assert.match(
    inclusiveThresholdMigration,
    /free_above_subtotal = 100\.00/,
  );
  assert.match(migration, /unit_count <= welcome_remaining/);
  assert.match(migration, /requested_expected_total/);
  assert.match(migration, /status = 'consumed'/);
  assert.match(migration, /status = 'released'/);
  assert.match(
    migration,
    /where reservation\.status = 'reserved'\s*\), 0\)::integer/,
    "unresolved reservations must stay in the balance even after local TTL",
  );
  assert.doesNotMatch(
    migration,
    /reservation\.status = 'reserved'\s+and reservation\.expires_at > now\(\)/,
    "a delayed paid callback must not let the ten-unit balance be reserved twice",
  );
  assert.match(migration, /grant execute on function public\.begin_bog_checkout_v2[\s\S]*to service_role;/);
  assert.match(migration, /grant execute on function public\.apply_bog_hooma_plus_result_v1[\s\S]*to service_role;/);
  assert.match(migration, /requested_payment_option is distinct from 'direct_debit'/);
  assert.match(migration, /requested_has_split is true/);
  assert.match(migration, /requested_payment_method not in \('card', 'google_pay', 'apple_pay'\)/);
  assert.match(migration, /new\.status = 'paid'[\s\S]*new\.signature_verified is true/);
  assert.match(
    migration,
    /set status = 'active',[\s\S]*where purchase_id = purchase_record\.id[\s\S]*status = 'review_required'/,
  );
  assert.match(migration, /delivery_terminal_review/);
  assert.match(migration, /terminal_review_reason/);
  assert.match(migration, /LATE_COMPLETED_AFTER_TERMINAL_STATUS/);
  assert.match(
    migration,
    /release_rejected_bog_delivery_reservation_v1[\s\S]*requested_provider_status[\s\S]*<> 'rejected'/,
  );
  assert.match(migration, /'REJECTED_RECEIPT_RECOVERY'/);
  assert.doesNotMatch(migration, /insert into public\.print_jobs/);
});

test("terminal payment provenance survives rejected -> manual review -> completed", () => {
  const migration = readFileSync(
    new URL("../supabase/migrations/20260729001100_hooma_plus_delivery.sql", import.meta.url),
    "utf8",
  );
  const catalogMarker = migration.slice(
    migration.indexOf("create or replace function public.mark_terminal_bog_delivery_review_v1"),
    migration.indexOf("create or replace function public.hold_late_paid_delivery_transition_v1"),
  );
  assert.match(catalogMarker, /old\.status in \('failed', 'cancelled'\)/);
  assert.match(catalogMarker, /new\.status in \('failed', 'cancelled'\)/);
  assert.match(catalogMarker, /old\.response_payload->>'delivery_terminal_review'/);
  assert.doesNotMatch(
    catalogMarker,
    /order_status' = 'completed'/,
    "an intervening unsupported provider state must not erase catalog terminal provenance",
  );
  assert.match(
    migration,
    /old\.response_payload->>'delivery_terminal_review'[\s\S]*LATE_PAID_AFTER_RELEASED_BENEFIT/,
    "a later corrected completion must still enter the deferred catalog hold",
  );

  const membershipMarker = migration.slice(
    migration.indexOf("create or replace function public.mark_terminal_bog_hooma_plus_review_v1"),
    migration.indexOf("drop trigger if exists set_hooma_plus_periods_updated_at"),
  );
  assert.match(membershipMarker, /old\.status in \('failed', 'cancelled'\)/);
  assert.match(membershipMarker, /new\.status in \('failed', 'cancelled'\)/);
  assert.match(membershipMarker, /old\.response_payload->>'terminal_review_reason'/);

  const membershipCallback = migration.slice(
    migration.indexOf("create or replace function public.apply_bog_hooma_plus_result_v1"),
  );
  assert.match(
    membershipCallback,
    /requested_provider_status in \('created', 'processing'\)[\s\S]*'failed',\s*'cancelled',\s*'paid'/,
    "a stale processing receipt must not resurrect a cancelled attempt",
  );
  assert.match(
    membershipCallback,
    /when attempt_record\.status in \('failed', 'cancelled'\)[\s\S]*terminal_review_reason/,
    "manual review must retain terminal provenance regardless of provider status",
  );
});

test("stale welcome-unit reservations require an authenticated rejected BOG receipt", () => {
  const action = readFileSync(
    new URL("../app/auth/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(action, /getBogPaymentDetails\(recoveredProviderId\)/);
  assert.match(action, /receipt\.status === "rejected"/);
  assert.match(action, /release_rejected_bog_delivery_reservation_v1/);
  assert.doesNotMatch(
    action,
    /Date\.now\(\) - attemptCreatedAt > 20 \* 60 \* 1000[\s\S]{0,300}resetCheckout: true/,
    "local age alone must not release a benefit reservation",
  );
});

test("stale membership sessions reconcile before allowing another charge", () => {
  const action = readFileSync(
    new URL("../app/account/hooma-plus/actions.ts", import.meta.url),
    "utf8",
  );
  assert.match(action, /getBogPaymentDetails\(recoveredProviderId\)/);
  assert.match(action, /receipt\.status === "rejected"/);
  assert.match(action, /recover_rejected_bog_hooma_plus_v1/);
  assert.match(action, /callback-ს ველოდებით\. ხელახლა ნუ გადაიხდი/);
});

test("lost browser checkout keys are recovered from customer-scoped attempts", () => {
  const recovery = readFileSync(
    new URL("../lib/payments/bog-stale-recovery.ts", import.meta.url),
    "utf8",
  );
  assert.match(recovery, /reconcileCustomerCatalogBogAttempts/);
  assert.match(recovery, /reconcileCustomerHoomaPlusBogAttempts/);
  assert.match(recovery, /\.eq\("orders\.customer_id", customerId\)/);
  assert.match(
    recovery,
    /\.eq\("hooma_plus_purchases\.customer_id", customerId\)/,
  );
  assert.match(recovery, /idempotency_key/);
  assert.match(recovery, /release_rejected_bog_delivery_reservation_v1/);
});

test("unresolved catalog payment reviews fail closed before another charge", () => {
  const recovery = readFileSync(
    new URL("../lib/payments/bog-stale-recovery.ts", import.meta.url),
    "utf8",
  );
  const catalogRecovery = recovery.slice(
    recovery.indexOf("export async function reconcileCustomerCatalogBogAttempts"),
    recovery.indexOf("export async function reconcileCustomerHoomaPlusBogAttempts"),
  );
  assert.match(catalogRecovery, /\.eq\("status", "review_required"\)/);
  assert.match(catalogRecovery, /\.eq\("orders\.customer_id", customerId\)/);
  assert.match(catalogRecovery, /\.eq\("orders\.test_mode", false\)/);
  assert.match(
    catalogRecovery,
    /reviewError \|\| \(reviewCount \?\? 0\) > 0[\s\S]*return \{ blocked: true \}/,
  );
});

test("Hooma+ callback verifies raw bytes before JSON and re-fetches the receipt", () => {
  const route = readFileSync(
    new URL("../app/api/payments/bog/hooma-plus/callback/route.ts", import.meta.url),
    "utf8",
  );
  const verification = route.indexOf("verifyBogCallbackSignature(rawBody");
  const deserialization = route.indexOf("JSON.parse(rawBody.toString");
  assert.ok(verification >= 0);
  assert.ok(deserialization > verification);
  assert.match(route, /getBogPaymentDetails\(callbackOrderId\)/);
  assert.match(route, /apply_bog_hooma_plus_result_v1/);
});
