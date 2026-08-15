import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260816000100_instagram_container_lifecycle.sql",
    import.meta.url,
  ),
  "utf8",
);

function functionBody(name, nextName) {
  const start = migration.indexOf(`create or replace function public.${name}`);
  const end = nextName
    ? migration.indexOf(`create or replace function public.${nextName}`, start + 1)
    : migration.indexOf("alter table public.social_instagram_publish_lifecycles enable row level security", start);
  assert.ok(start >= 0, `${name} must exist`);
  assert.ok(end > start, `${name} must have a bounded body`);
  return migration.slice(start, end);
}

test("migration models durable container and media_publish boundaries", () => {
  assert.match(migration, /^-- Crash-safe Instagram content-container lifecycle\./);
  assert.match(migration, /\nbegin;[\s\S]*\ncommit;\s*$/);
  assert.match(migration, /create table public\.social_instagram_publish_lifecycles/);
  assert.match(migration, /container_create_operation_id uuid not null/);
  assert.match(migration, /container_create_idempotency_key text not null unique/);
  assert.match(migration, /container_create_request_sha256 text not null/);
  assert.match(migration, /provider_container_id text unique/);
  assert.match(migration, /provider_container_status text check/);
  assert.match(migration, /media_publish_operation_id uuid unique/);
  assert.match(migration, /media_publish_request_sha256 text/);
  assert.match(migration, /'MEDIA_PUBLISH_INTENT_RECORDED'/);
  assert.match(migration, /'MEDIA_PUBLISH_OUTCOME_UNKNOWN'/);
  assert.match(migration, /'MEDIA_PUBLISH_CONFIRMED'/);
  assert.match(migration, /'MEDIA_PUBLISH_REJECTED'/);
  assert.match(migration, /requested_provider_container_id ~ '\^\[1-9\]\[0-9\]\{0,255\}\$'/);
  assert.match(migration, /provider_permalink ~ '\^https:\/\/\(www\\\.\)\?instagram\\\.com\/'/);
});

test("container create is exact-once dispatch with idempotent resume", () => {
  const begin = functionBody(
    "begin_instagram_container_create_v1",
    "get_instagram_publish_resume_v1",
  );

  assert.match(begin, /for update;/);
  assert.match(begin, /selected_job\.provider <> 'instagram'/);
  assert.match(begin, /selected_job\.state <> 'publishing'/);
  assert.match(begin, /selected_job\.publishing_allowed is not true/);
  assert.match(begin, /selected_job\.claim_id is distinct from requested_claim_id/);
  assert.match(begin, /container_create_idempotency_key[\s\S]*is distinct from requested_idempotency_key/);
  assert.match(begin, /container_create_request_sha256[\s\S]*is distinct from requested_request_sha256/);
  assert.match(begin, /lifecycle_response\(selected_lifecycle, false\)/);
  assert.match(begin, /'INSTAGRAM_CONTAINER_CREATE_INTENT'/);
  assert.match(begin, /'dispatch_allowed', true/);
  assert.match(begin, /lifecycle_response\(selected_lifecycle, true\)/);
  assert.ok(
    begin.indexOf("insert into public.social_publish_receipts")
      < begin.lastIndexOf("lifecycle_response(selected_lifecycle, true)"),
  );
});

test("container ID and status are persisted and polled monotonically", () => {
  const created = functionBody(
    "record_instagram_container_created_v1",
    "record_instagram_container_status_v1",
  );
  const status = functionBody(
    "record_instagram_container_status_v1",
    "begin_instagram_media_publish_v1",
  );

  assert.match(created, /set provider_container_id = requested_provider_container_id,/);
  assert.match(created, /provider_container_status = requested_provider_status,/);
  assert.match(created, /container_recorded_at = clock_timestamp\(\)/);
  assert.match(created, /'INSTAGRAM_CONTAINER_CREATED'/);
  assert.match(status, /selected_lifecycle\.phase <> 'CONTAINER_PROCESSING'/);
  assert.match(status, /raise exception 'INSTAGRAM_CONTAINER_STATUS_IS_TERMINAL'/);
  assert.match(status, /poll_count = lifecycle\.poll_count \+ 1/);
  assert.match(status, /'INSTAGRAM_CONTAINER_STATUS'/);
  assert.match(migration, /INSTAGRAM_PROVIDER_CONTAINER_ID_IS_IMMUTABLE/);
  assert.match(migration, /INSTAGRAM_PROVIDER_CONTAINER_STATUS_IS_FINAL/);
});

test("media_publish ambiguity is a separate non-replayable operation", () => {
  const begin = functionBody(
    "begin_instagram_media_publish_v1",
    "record_instagram_media_publish_outcome_v1",
  );
  const outcome = functionBody("record_instagram_media_publish_outcome_v1");

  assert.match(begin, /selected_lifecycle\.phase <> 'CONTAINER_READY'/);
  assert.match(begin, /provider_container_status <> 'FINISHED'/);
  assert.match(begin, /media_publish_idempotency_key[\s\S]*is distinct from requested_idempotency_key/);
  assert.match(begin, /media_publish_request_sha256[\s\S]*is distinct from requested_request_sha256/);
  assert.match(begin, /lifecycle_response\(selected_lifecycle, false\)/);
  assert.match(begin, /'INSTAGRAM_MEDIA_PUBLISH_INTENT'/);
  assert.match(begin, /'dispatch_allowed', true/);
  assert.match(outcome, /'CONFIRMED', 'UNKNOWN', 'REJECTED_NO_SIDE_EFFECT'/);
  assert.match(outcome, /when 'UNKNOWN' then 'MEDIA_PUBLISH_OUTCOME_UNKNOWN'/);
  assert.match(outcome, /'requires_reconciliation', requested_outcome = 'UNKNOWN'/);
  assert.match(outcome, /selected_lifecycle\.phase not in \([\s\S]*'MEDIA_PUBLISH_OUTCOME_UNKNOWN'/);
  assert.match(migration, /when 'MEDIA_PUBLISH_OUTCOME_UNKNOWN' then 'RECONCILE_MEDIA_PUBLISH'/);
  assert.match(migration, /when 'MEDIA_PUBLISH_CONFIRMED' then 'COMPLETE_EXISTING_SOCIAL_JOB'/);
});

test("all evidence is redacted, append-only, and service-RPC only", () => {
  for (const name of [
    "begin_instagram_container_create_v1",
    "record_instagram_container_created_v1",
    "record_instagram_container_status_v1",
    "begin_instagram_media_publish_v1",
    "record_instagram_media_publish_outcome_v1",
  ]) {
    const body = functionBody(
      name,
      name === "begin_instagram_container_create_v1"
        ? "get_instagram_publish_resume_v1"
        : name === "record_instagram_container_created_v1"
          ? "record_instagram_container_status_v1"
          : name === "record_instagram_container_status_v1"
            ? "begin_instagram_media_publish_v1"
            : name === "begin_instagram_media_publish_v1"
              ? "record_instagram_media_publish_outcome_v1"
              : undefined,
    );
    assert.match(body, /public\.social_json_is_redacted\(requested_receipt_payload\) is not true/);
    assert.match(body, /insert into public\.social_publish_receipts/);
    assert.match(body, /insert into public\.social_publish_audit_events/);
  }

  assert.match(migration, /enable row level security;/);
  assert.match(migration, /force row level security;/);
  assert.match(migration, /revoke all on public\.social_instagram_publish_lifecycles[\s\S]*service_role;/);
  assert.doesNotMatch(migration, /grant (insert|update|delete)[\s\S]*social_instagram_publish_lifecycles/i);
  assert.match(migration, /grant execute on function public\.begin_instagram_container_create_v1[\s\S]*to service_role;/);
  assert.match(migration, /grant execute on function public\.record_instagram_media_publish_outcome_v1[\s\S]*to service_role;/);
  assert.match(migration, /before update or delete on public\.social_instagram_publish_lifecycles/);
});

test("migration preserves generic published semantics and keeps publishing disabled", () => {
  assert.doesNotMatch(migration, /create or replace function public\.complete_social_publish_job/);
  assert.doesNotMatch(migration, /update public\.social_publish_jobs/);
  assert.doesNotMatch(migration, /set\s+publishing_allowed\s*=\s*true/i);
  assert.doesNotMatch(migration, /insert into public\.social_publish_jobs/);
});
