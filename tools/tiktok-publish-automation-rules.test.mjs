import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(
  new URL("../supabase/migrations/20260821000100_tiktok_publish_lifecycle_and_analytics.sql", import.meta.url),
  "utf8",
);
const worker = readFileSync(new URL("../lib/social/tiktok-publish-worker.ts", import.meta.url), "utf8");
const provider = readFileSync(new URL("../lib/social/providers/tiktok-business-organic.ts", import.meta.url), "utf8");
const cron = readFileSync(new URL("../app/api/cron/social-publish/route.ts", import.meta.url), "utf8");
const campaign = readFileSync(new URL("../lib/social/campaigns/tiktok-nine-day-2026-08-22.ts", import.meta.url), "utf8");
const canary = readFileSync(new URL("../app/api/social/tiktok/canary/route.ts", import.meta.url), "utf8");
const retryMigration = readFileSync(
  new URL("../supabase/migrations/20260823000100_rearm_failed_tiktok_policy_job.sql", import.meta.url),
  "utf8",
);

test("TikTok lifecycle records immutable intent before the only publish dispatch", () => {
  assert.match(migration, /create table if not exists public\.social_tiktok_publish_lifecycles/);
  assert.match(migration, /'PUBLISH_INTENT_RECORDED'/);
  assert.match(migration, /public\.social_music_receipt_is_valid/);
  assert.match(migration, /return public\.social_tiktok_lifecycle_response\(lifecycle, true\)/);
  assert.match(worker, /begin_tiktok_publish_v1/);
  assert.ok(worker.indexOf("begin_tiktok_publish_v1") < worker.indexOf("client.publishVideo(input"));
  assert.match(worker, /if \(!lifecycle\.dispatchAllowed\)/);
  assert.match(worker, /remoteSideEffectPossible: boolean/);
});

test("TikTok lifecycle and analytics are service-only and exact-replay bound", () => {
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.social_tiktok_publish_lifecycles[\s\S]*from public, anon, authenticated, service_role/);
  assert.match(migration, /grant execute on function public\.begin_tiktok_publish_v1[\s\S]*to service_role/);
  assert.match(migration, /replay_event\.event_data = expected_event/);
  assert.doesNotMatch(migration, /replay_event\.event_data\s*@>/);
  assert.match(migration, /claim_due_tiktok_analytics_v1/);
  assert.match(migration, /'T2H'.*'T24H'.*'T72H'/s);
  assert.match(migration, /jsonb_typeof\(metric\.value\) not in \('null', 'number'\)/);
});

test("licensed pre-mixed masters stay intact and silent publishing cannot enter the campaign", () => {
  assert.match(provider, /"HOOMA_OWNED_MASTER"/);
  assert.match(provider, /validateTikTokOwnedMasterReceipt/);
  assert.match(provider, /Omitting music_sound_info prevents TikTok from replacing it/);
  assert.match(campaign, /HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE/);
  assert.match(campaign, /platforms: \["tiktok"\]/);
  assert.match(campaign, /sourceInstagramPostId/);
  assert.match(campaign, /replace\("-IG-", "-TT-"\)/);
});

test("production cron wires TikTok publish and analytics without weakening authentication", () => {
  assert.match(cron, /authenticateSocialCronRequest/);
  assert.match(cron, /runTikTokPublishWorker/);
  assert.match(cron, /runTikTokAnalyticsWorker/);
  assert.match(cron, /runInstagramPublishWorker/);
  assert.match(cron, /runInstagramAnalyticsWorker/);
});

test("provider refuses redirect-following and performs bounded owned-post duplicate scans", () => {
  assert.match(provider, /redirect: "error"/);
  assert.match(provider, /maxPages > 5/);
  assert.match(provider, /url\.searchParams\.set\("max_count", "20"\)/);
  assert.match(provider, /status: "INCONCLUSIVE_PAGE_LIMIT"/);
  assert.match(provider, /sha256Text\(caption\) === input\.captionSha256/);
});

test("read-only canary exposes only the provider's sanitized diagnostic code", () => {
  assert.match(canary, /error instanceof TikTokOrganicError/);
  assert.match(canary, /return error\.code/);
  assert.doesNotMatch(canary, /error\.message[^\n]*response/);
  assert.doesNotMatch(canary, /accessToken[^\n]*response/);
});

test("policy failures keep their exact safe gate and allow one pre-dispatch retry", () => {
  assert.match(worker, /function policyGateError/);
  assert.match(worker, /`POLICY_GATE_\$\{failures\[0\]/);
  assert.match(worker, /throw policyGateError\(publishingFailures\)/);
  assert.match(retryMigration, /create or replace function public\.rearm_failed_tiktok_policy_job_v1/);
  assert.match(retryMigration, /selected_job\.last_error_code <> 'POLICY_GATE_MISMATCH'/);
  assert.match(retryMigration, /selected_job\.attempts <> 1/);
  assert.match(retryMigration, /social_tiktok_publish_lifecycles/);
  assert.match(retryMigration, /remote_publish_intent_absent', true/);
  assert.match(retryMigration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(retryMigration, /to authenticated/);
});
