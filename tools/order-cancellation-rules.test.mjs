import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const functionBody = (migration, name) => {
  const start = migration.indexOf(`create or replace function public.${name}`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = migration.indexOf("create or replace function public.", start + 32);
  return migration.slice(start, next < 0 ? migration.length : next);
};

test("cancellation ledger is customer-readable but service-role mutated", () => {
  const migration = read("supabase/migrations/20260805000100_customer_order_cancellation_refunds.sql");

  assert.match(migration, /create table(?: if not exists)? public\.order_cancellation_refunds/i);
  assert.match(migration, /order_id uuid[^;]*unique|unique\s*\(order_id\)/i);
  assert.match(migration, /refund_idempotency_key uuid[^;]*unique|unique\s*\(refund_idempotency_key\)/i);
  assert.match(migration, /status text[\s\S]*processing[\s\S]*refund_submitted[\s\S]*review_required[\s\S]*submission_failed[\s\S]*refunded/i);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /profile_id\s*=\s*auth\.uid\(\)/i);
  assert.match(migration, /revoke all on table public\.order_cancellation_refunds\s+from public, anon, authenticated/i);
  assert.match(migration, /grant select \([\s\S]*?\) on table public\.order_cancellation_refunds to authenticated/i);
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all)[^;]*order_cancellation_refunds[^;]*authenticated/i);
});

test("claim RPC owns, locks, and freezes only an exact paid pre-production BOG catalog order", () => {
  const migration = read("supabase/migrations/20260805000100_customer_order_cancellation_refunds.sql");
  const claim = functionBody(migration, "claim_customer_bog_refund_v1");

  const orderLock = claim.indexOf("from public.orders");
  const attemptLock = claim.indexOf("from public.payment_attempts");
  assert.ok(orderLock >= 0 && attemptLock > orderLock, "order must lock before payment attempt");
  assert.match(claim.slice(orderLock, attemptLock), /for update/i);
  assert.match(claim.slice(attemptLock), /for update/i);
  assert.match(claim, /profile_id\s*=\s*actor_profile_id/i);
  assert.match(claim, /order_record\.test_mode is true/i);
  assert.match(claim, /order_record\.fulfillment_status not in \('order_received', 'confirmed'\)/i);
  assert.match(claim, /attempt\.provider\s*=\s*'bog'/i);
  assert.match(claim, /attempt_record\.status[^\n]*'paid'/i);
  assert.match(claim, /attempt_record\.signature_verified is (?:not true|distinct from true)/i);
  assert.match(claim, /attempt_record\.currency[^\n]*'GEL'/i);
  assert.match(claim, /attempt_record\.amount[^\n]*order_record\.total/i);
  assert.match(claim, /provider_payment_id/i);
  assert.match(claim, /from public\.order_items[\s\S]*product_id is null/i);
  assert.match(claim, /from public\.print_jobs/i);
  assert.match(claim, /from public\.custom_quote_requests/i);
  assert.match(claim, /set[\s\S]*status = 'cancelled'[\s\S]*fulfillment_status = 'cancelled'/i);
  assert.doesNotMatch(claim, /set[\s\S]{0,180}payment_status\s*=\s*'refunded'/i);
  assert.match(claim, /'should_submit', true/i);
  assert.match(claim, /'should_submit', false/i);
  assert.match(claim, /where refund\.order_id = order_record\.id[\s\S]*?'should_submit', false/i);
  assert.match(claim, /event_type[\s\S]*?'cancellation_requested'/i);
  assert.match(claim, /insert into public\.audit_log/i);
});

test("refund submission ACK is not financial finality", () => {
  const migration = read("supabase/migrations/20260805000100_customer_order_cancellation_refunds.sql");
  const record = functionBody(migration, "record_bog_refund_submission_v1");

  assert.match(record, /refund_submitted/i);
  assert.match(record, /review_required|submission_failed/i);
  assert.doesNotMatch(record, /update public\.orders[\s\S]*payment_status\s*=\s*'refunded'/i);
  assert.doesNotMatch(record, /update public\.payment_attempts[\s\S]*status\s*=\s*'refunded'/i);

  const transport = read("lib/payments/bog.ts");
  const refund = transport.slice(transport.indexOf("export async function requestBogFullRefund"));
  assert.match(transport, /payments\/v1\/payment\/refund/);
  assert.match(refund, /"Idempotency-Key": idempotencyKey/);
  assert.match(refund, /body: JSON\.stringify\(\{\}\)/);
  assert.match(refund, /key !== "request_received"/);
  assert.doesNotMatch(refund, /amount\s*:/);
  assert.doesNotMatch(refund, /payment_status\s*[:=]\s*["']refunded["']/);
});

test("only a signature-verified full-refund payment transition finalizes the ledger", () => {
  const migration = read("supabase/migrations/20260805000100_customer_order_cancellation_refunds.sql");
  const sync = functionBody(migration, "sync_order_cancellation_refund_from_bog_v1");

  assert.match(sync, /new\.provider[^\n]*'bog'/i);
  assert.match(sync, /new\.status[^\n]*'refunded'/i);
  assert.match(sync, /new\.signature_verified is not true/i);
  assert.match(sync, /set status = 'refunded'/i);
  assert.match(sync, /refunded_at/i);
});

test("customer action re-authenticates and calls BOG only for a new trusted claim", () => {
  const action = read("app/account/orders/actions.ts");

  assert.match(action, /supabase\.auth\.getUser\(\)/);
  assert.match(action, /getBogCustomerRefundAvailability\(\)/);
  assert.match(action, /claim_customer_bog_refund_v1/);
  const duplicateGuard = action.indexOf("if (!should_submit)");
  const providerRequest = action.indexOf("requestBogFullRefund(");
  assert.ok(duplicateGuard >= 0 && providerRequest > duplicateGuard);
  assert.match(action.slice(duplicateGuard, providerRequest), /return resultForExisting/);
  assert.match(action, /record_bog_refund_submission_v1/);
  assert.match(action, /revalidatePath\("\/account\/orders"\)/);
  const publicInput = action.slice(
    action.indexOf("export type CustomerOrderCancellationInput"),
    action.indexOf("const uuidPattern"),
  );
  assert.doesNotMatch(publicInput, /provider|amount|paymentStatus/i);
});

test("account UI makes the irreversible full-refund cutoff explicit", () => {
  const page = read("app/account/orders/page.tsx");
  const button = read("components/account/OrderCancellationButton.tsx");

  assert.match(page, /order_cancellation_refunds/);
  assert.match(page, /getBogCustomerRefundAvailability/);
  assert.match(page, /order_received[\s\S]*confirmed/);
  assert.match(page, /refund_submitted|review_required|submission_failed|refunded/);
  assert.match(page, /const cancellationStatus = cancellation\?\.status[\s\S]*order\.payment_status === "refunded"/);
  assert.match(page, /operationalRefundHold/);
  assert.match(page, /orderCancelled=\{orderCancelled\}/);
  assert.match(button, /requestCustomerOrderCancellationAction/);
  assert.match(button, /crypto\.randomUUID\(\)/);
  assert.match(button, /მიწოდების საფასურ(?:ის ჩათვლით|იც)/);
  assert.match(button, /შეუქცევად/);
  assert.match(button, /თავდაპირველ გადახდის მეთოდზე/);
  assert.match(button, /წარმოების დაწყებამდე/);
  assert.match(button, /ფიზიკური ეტაპი ავტომატურად არ შეცვლილა/);
});

test("unexpected post-production refunds preserve the physical operations stage", () => {
  const migration = read("supabase/migrations/20260805000100_customer_order_cancellation_refunds.sql");
  const adminPage = read("app/admin/orders/page.tsx");
  const kanban = read("components/admin/OrderOperationsKanban.tsx");
  const productionPage = read("app/admin/production/page.tsx");
  const workflow = read("lib/production/manual-workflow.ts");

  assert.match(adminPage, /fulfillmentStatus: order\.fulfillment_status/);
  assert.match(adminPage, /operationalRefundHold/);
  assert.match(kanban, /card\.paymentReady && !card\.operationalRefundHold[\s\S]*expectedTarget/);
  assert.match(kanban, /ოპერაციული HOLD/);
  assert.match(kanban, /ფიზიკური წარმოების ეტაპი ავტომატურად არ შეცვლილა/);
  assert.match(migration, /guard_refunded_print_job_mutation_v1/);
  assert.match(migration, /before insert or update or delete on public\.print_jobs/i);
  assert.match(migration, /new\.order_item_id is distinct from old\.order_item_id[\s\S]*PRINT_JOB_ORDER_ITEM_IMMUTABLE/i);
  assert.match(migration, /order_record\.payment_status = 'refunded'[\s\S]*order_cancellation_refunds/i);
  assert.match(productionPage, /order_cancellation_refunds/);
  assert.match(productionPage, /refundHoldOrderIds/);
  assert.match(productionPage, /refundHold \? <RefundProductionHold[\s\S]*assignPrintJobAction/);
  assert.match(productionPage, /refundHold \? <RefundProductionHold[\s\S]*completePrintJobAction/);
  assert.match(productionPage, /refundHold \? <RefundProductionHold[\s\S]*approveOrderQcAction/);
  assert.match(workflow, /ORDER_REFUND_HOLD_ACTIVE/);
  assert.match(migration, /profile\.role in \('owner', 'admin', 'production_operator', 'support'\)/);
});

test("terms, assistant, and operations docs share the cancellation policy", () => {
  const terms = read("app/terms/page.tsx");
  const knowledge = read("lib/storefront-assistant/knowledge.ts");
  const docs = read("docs/bog-payments.md");

  for (const source of [terms, knowledge]) {
    assert.match(source, /წარმოების დაწყებამდე/);
    assert.match(source, /მიწოდების საფასურის ჩათვლით/);
    assert.match(source, /თავდაპირველ მეთოდზე|თავდაპირველ გადახდის მეთოდზე/);
  }
  assert.match(knowledge, /id: "order-cancellation"/);
  assert.match(docs, /BOG_CUSTOMER_REFUNDS_ENABLED/);
  assert.match(docs, /request_received[\s\S]*not[\s\S]*refunded|request_received[\s\S]*არ არის/i);
  assert.match(docs, /signed callback|ხელმოწერილ callback/i);
});
