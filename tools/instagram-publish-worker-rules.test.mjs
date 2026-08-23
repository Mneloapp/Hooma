import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const source = (path) => readFile(new URL(path, root), "utf8");

test("Instagram publish cron is authenticated and has half-hour backup schedules", async () => {
  const config = JSON.parse(await source("vercel.json"));
  const entries = config.crons.filter((entry) => entry.path === "/api/cron/social-publish");
  assert.equal(entries.length, 48);
  assert.equal(new Set(entries.map((entry) => entry.schedule)).size, 48);
  const route = await source("app/api/cron/social-publish/route.ts");
  assert.match(route, /authenticateSocialCronRequest\(request\)/);
  assert.match(route, /runInstagramPublishWorker\(\)/);
  assert.match(route, /runInstagramAnalyticsWorker\(\)/);
  assert.match(route, /Cache-Control": "no-store"/);
});

test("analytics records immutable T+2h, T+24h and T+72h null-aware snapshots", async () => {
  const migration = await source(
    "supabase/migrations/20260819000200_instagram_analytics_snapshots.sql",
  );
  const worker = await source("lib/social/instagram-analytics-worker.ts");
  assert.match(migration, /'T2H'.*interval '2 hours'/);
  assert.match(migration, /'T24H'.*interval '24 hours'/);
  assert.match(migration, /'T72H'.*interval '72 hours'/);
  assert.match(migration, /event_type = 'ANALYTICS_SNAPSHOT'/);
  assert.match(migration, /social_json_is_redacted\(payload\)/);
  assert.match(worker, /fetchMediaInsights/);
  assert.match(worker, /instagramInsightsEnabled\(\)/);
  assert.match(worker, /error instanceof InstagramReelsReadError/);
  assert.match(worker, /`INSTAGRAM_\$\{operation\}_\$\{error\.code\}`/);
  assert.match(worker, /views: snapshot\.metrics\.views/);
  assert.doesNotMatch(worker, /\?\?\s*0/);
  assert.doesNotMatch(worker, /delete|promote|boost/i);
});

test("worker is triple-gated and records both remote intents before POST dispatch", async () => {
  const worker = await source("lib/social/instagram-publish-worker.ts");
  assert.match(worker, /!socialPublishingEnabled\(\) \|\| !instagramPublishingEnabled\(\)/);
  assert.match(worker, /claim_due_instagram_publish_work_v1/);
  assert.match(worker, /claim_due_social_publish_job/);
  assert.match(worker, /authorize_social_publish_job/);
  assert.ok(
    worker.indexOf('begin_instagram_container_create_v1')
      < worker.indexOf('publishClient.createReelContainer'),
  );
  assert.ok(
    worker.indexOf('begin_instagram_media_publish_v1')
      < worker.indexOf('publishClient.publishReel'),
  );
  assert.match(worker, /record_instagram_media_publish_outcome_v1/);
  assert.match(worker, /REMOTE_RESULT_UNCERTAIN/);
  assert.doesNotMatch(worker, /console\.(?:log|error|warn)/);
  assert.doesNotMatch(worker, /provider_payload:\s*\{[^}]*access[_-]?token/is);
});

test("resume lease cannot authorize or dispatch any remote effect", async () => {
  const migration = await source(
    "supabase/migrations/20260819000100_instagram_publish_worker_claim.sql",
  );
  assert.match(migration, /job\.state = 'publishing'/);
  assert.match(migration, /job\.claim_expires_at <= now\(\)/);
  assert.match(migration, /for update of job skip locked/);
  assert.match(migration, /where lifecycle\.job_id = selected_job\.id[\s\S]*for update/);
  assert.match(migration, /grant execute[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /begin_instagram_(?:container_create|media_publish)_v1\s*\(/);
  assert.doesNotMatch(migration, /http|net\.|fetch|graph\.instagram/i);
});

test("staging stays private, hash-bound, origin-pinned and long-lived enough for Meta fetch", async () => {
  const staging = await source("lib/social/staging.ts");
  assert.match(staging, /social-publishing-staging/);
  assert.match(staging, /SOCIAL_SIGNED_URL_TTL_SECONDS = 3_600/);
  assert.match(staging, /observedSha256 !== expectedSha256/);
  assert.match(staging, /url\.origin !== base\.origin/);
  assert.doesNotMatch(staging, /getPublicUrl/);
});

test("worker releases stale unknown outcomes only after a complete remote scan and grace period", async () => {
  const worker = await source("lib/social/instagram-publish-worker.ts");
  assert.match(worker, /duplicate\.status === "CLEAR"/);
  assert.match(worker, /UNKNOWN_OUTCOME_RECONCILIATION_GRACE_MS/);
  assert.match(worker, /Date\.parse\(job\.publishNotAfter\)/);
  assert.match(worker, /"REJECTED_NO_SIDE_EFFECT"/);
  assert.match(worker, /INSTAGRAM_REMOTE_PUBLISH_NOT_FOUND/);
});
