import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const route = readFileSync(
  new URL("../app/api/social/today-tissue-crosspost-2026-08-21/finalize/route.ts", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL("../supabase/migrations/20260821000200_owner_reschedule_social_publish_job.sql", import.meta.url),
  "utf8",
);

test("the owner-only route cancels the old identity before inserting a replacement", () => {
  assert.match(route, /requirePermission\("team\.manage"\)/);
  assert.match(route, /actor\.role !== "owner"/);
  assert.match(route, /new URL\(request\.url\)\.origin !== "https:\/\/hooma\.ge"/);
  const cancel = route.indexOf("cancel_social_publish_job_for_replacement");
  const insert = route.indexOf('.from("social_publish_jobs").insert');
  assert.ok(cancel > 0);
  assert.ok(insert > cancel);
  assert.match(route, /approved\.approval_fingerprint !== contentFingerprint/);
  assert.match(route, /shareToFacebook: false/);
  assert.doesNotMatch(route, /console\.(log|debug|info)/);
});

test("the cancellation RPC is owner-bound, idempotent, auditable, and non-destructive", () => {
  assert.match(migration, /actor_profile_id uuid := auth\.uid\(\)/);
  assert.match(migration, /role = 'owner'/);
  assert.match(migration, /selected_job\.state = 'cancelled'/);
  assert.match(migration, /selected_job\.attempts <> 0/);
  assert.match(migration, /provider_publish_id is not null/);
  assert.match(migration, /provider_post_id is not null/);
  assert.match(migration, /insert into public\.social_publish_receipts/);
  assert.match(migration, /insert into public\.social_publish_audit_events/);
  assert.match(migration, /insert into public\.audit_log/);
  assert.match(migration, /grant execute[\s\S]*to authenticated/);
  assert.doesNotMatch(migration, /delete from public\.social_publish_jobs/i);
});
