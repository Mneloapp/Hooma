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

test("first dispatches re-check every mutable authorization gate after replay detection", () => {
  const beginCreate = functionBody(
    "begin_instagram_container_create_v1",
    "get_instagram_publish_resume_v1",
  );
  const beginPublish = functionBody(
    "begin_instagram_media_publish_v1",
    "record_instagram_media_publish_outcome_v1",
  );

  for (const body of [beginCreate, beginPublish]) {
    const reconciliationReturn = body.indexOf(
      "return public.social_instagram_lifecycle_response(selected_lifecycle, false);",
    );
    const freshGate = body.indexOf("selected_job.claim_expires_at is null");
    const firstDispatch = body.lastIndexOf(
      "return public.social_instagram_lifecycle_response(selected_lifecycle, true);",
    );

    assert.ok(reconciliationReturn >= 0);
    assert.ok(freshGate > reconciliationReturn);
    assert.ok(firstDispatch > freshGate);
    assert.match(body, /selected_job\.claim_expires_at <= now\(\)/);
    assert.match(body, /selected_job\.scheduled_at > now\(\)/);
    assert.match(body, /selected_job\.publish_not_after < now\(\)/);
    assert.match(body, /selected_job\.approval_status <> 'APPROVED_EXACT'/);
    assert.match(body, /selected_job\.approval_fingerprint <> selected_job\.content_fingerprint/);
    assert.match(body, /selected_job\.rights_status <> 'CLEARED'/);
    assert.match(body, /selected_job\.visual_claims_status <> 'CLEARED'/);
    assert.match(body, /from public\.products product[\s\S]*product\.status = 'active'/);
    assert.match(body, /connection\.provider = 'instagram'/);
    assert.match(body, /connection\.status = 'active'/);
    assert.match(body, /connection\.access_expires_at > now\(\) \+ interval '5 minutes'/);
  }
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

test("recording RPCs accept only materially exact event-key replays", () => {
  const created = functionBody(
    "record_instagram_container_created_v1",
    "record_instagram_container_status_v1",
  );
  const status = functionBody(
    "record_instagram_container_status_v1",
    "begin_instagram_media_publish_v1",
  );
  const outcome = functionBody("record_instagram_media_publish_outcome_v1");

  for (const body of [created, status, outcome]) {
    assert.match(body, /replay_receipt public\.social_publish_receipts%rowtype/);
    assert.match(body, /replay_receipt\.attempt_number = selected_job\.attempts/);
    assert.match(body, /replay_receipt\.provider_request_id[\s\S]*is not distinct from requested_provider_request_id/);
    assert.match(body, /replay_receipt\.provider_publish_id[\s\S]*is not distinct from/);
    assert.match(body, /replay_receipt\.payload = \(/);
    assert.match(body, /raise exception 'INSTAGRAM_LIFECYCLE_EVENT_IDEMPOTENCY_CONFLICT'/);
  }

  assert.match(created, /'operation_id', requested_operation_id/);
  assert.match(created, /'provider_container_status', requested_provider_status/);
  assert.match(created, /'next_poll_at', requested_next_poll_at/);
  assert.match(created, /raise exception 'INSTAGRAM_CONTAINER_CREATED_REPLAY_CONFLICT'/);
  assert.match(status, /'operation_id', requested_operation_id/);
  assert.match(status, /'provider_container_status', requested_provider_status/);
  assert.match(status, /replay_receipt\.payload \? 'poll_count'/);
  assert.match(status, /jsonb_typeof\(replay_receipt\.payload -> 'poll_count'\) = 'number'/);
  assert.match(status, /'poll_count', replay_receipt\.payload -> 'poll_count'/);
  assert.match(status, /if selected_lifecycle\.phase <> 'CONTAINER_PROCESSING' then\s+raise exception/);
  assert.match(outcome, /replay_receipt\.provider_post_id[\s\S]*is not distinct from requested_provider_post_id/);
  assert.match(outcome, /'outcome', requested_outcome/);
  assert.match(outcome, /'provider_permalink', requested_provider_permalink/);
  assert.match(outcome, /if selected_lifecycle\.media_publish_outcome in \('CONFIRMED', 'REJECTED_NO_SIDE_EFFECT'\) then\s+raise exception/);
  assert.doesNotMatch(migration, /replay_job_id|replay_event_type/);
  assert.doesNotMatch(migration, /replay_receipt\.payload\s*@>/);
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
