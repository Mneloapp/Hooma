import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260830000100_rearm_failed_tiktok_media_binding_job.sql", import.meta.url),
  "utf8",
);

test("TikTok media-binding retry is service-only and exact-job bound", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /last_error_code <> 'TIKTOK_MEDIA_SOURCE_BINDING_MISMATCH'/);
  assert.match(migration, /video_object_path[\s\S]*video-' \|\| expected_video_sha256 \|\| '\.mp4'/);
  assert.match(migration, /expected_campaign_approval_fingerprint/);
  assert.match(migration, /expected_attempts <> 1/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /grant execute[\s\S]*to authenticated/);
});

test("retry proves the first attempt had no remote side effect", () => {
  assert.match(migration, /event_type = 'PUBLISH_FAILED'/);
  assert.match(migration, /remote_side_effect_possible' = 'false'/);
  assert.match(migration, /provider_request_id is null/);
  assert.match(migration, /provider_publish_id is null/);
  assert.match(migration, /provider_post_id is null/);
  assert.match(migration, /social_tiktok_publish_lifecycles/);
  assert.match(migration, /'PUBLISH_SUCCEEDED', 'REMOTE_VERIFIED'/);
  assert.doesNotMatch(migration, /delete from public\.social_/i);
});

test("retry creates a bounded same-day window and a fresh exact approval", () => {
  assert.match(migration, /requested_publish_not_after <= now\(\) \+ interval '15 minutes'/);
  assert.match(migration, /requested_publish_not_after > now\(\) \+ interval '3 hours'/);
  assert.match(migration, /time zone 'Asia\/Tbilisi'/);
  assert.match(migration, /set approval_status = 'REVOKED'/);
  assert.match(migration, /set publish_not_after = requested_publish_not_after/);
  assert.match(migration, /set approval_status = 'APPROVED_EXACT'/);
  assert.match(migration, /approval_fingerprint = selected_job\.content_fingerprint/);
  assert.match(migration, /remote_duplicate_status = 'UNKNOWN'/);
  assert.match(migration, /TIKTOK_MEDIA_BINDING_RETRY_ARMED/);
  assert.match(migration, /OWNER_REQUESTED_SAME_DAY_TIKTOK_RETRY/);
});
