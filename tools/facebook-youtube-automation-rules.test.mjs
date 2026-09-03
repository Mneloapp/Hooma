import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const migration = fs.readFileSync(
  new URL("../supabase/migrations/20260830000200_facebook_youtube_social_automation.sql", import.meta.url),
  "utf8",
);
const identityMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260903000100_align_facebook_youtube_identity_handles.sql", import.meta.url),
  "utf8",
);
const usernameMigration = fs.readFileSync(
  new URL("../supabase/migrations/20260903000200_allow_pinned_external_social_usernames.sql", import.meta.url),
  "utf8",
);
const config = fs.readFileSync(new URL("../lib/social/config.ts", import.meta.url), "utf8");
const cron = fs.readFileSync(new URL("../app/api/cron/social-publish/route.ts", import.meta.url), "utf8");
const publishWorker = fs.readFileSync(
  new URL("../lib/social/external-social-publish-worker.ts", import.meta.url),
  "utf8",
);
const analyticsWorker = fs.readFileSync(
  new URL("../lib/social/external-social-analytics-worker.ts", import.meta.url),
  "utf8",
);
const facebookProvider = fs.readFileSync(
  new URL("../lib/social/providers/facebook-reels.ts", import.meta.url),
  "utf8",
);
const youtubeProvider = fs.readFileSync(
  new URL("../lib/social/providers/youtube-shorts.ts", import.meta.url),
  "utf8",
);
const tokenCron = fs.readFileSync(
  new URL("../app/api/cron/social-tokens/route.ts", import.meta.url),
  "utf8",
);
const instagramCampaign = fs.readFileSync(
  new URL("../lib/social/campaigns/instagram-nine-day-2026-08-22.ts", import.meta.url),
  "utf8",
);

test("new providers are separate and remain fail-closed behind independent switches", () => {
  for (const marker of [
    "HOOMA_FACEBOOK_OAUTH_ENABLED",
    "HOOMA_FACEBOOK_API_NETWORK_ENABLED",
    "HOOMA_FACEBOOK_PUBLISHING_ENABLED",
    "FACEBOOK_APP_REVIEW_RECEIPT_SHA256",
    "HOOMA_YOUTUBE_OAUTH_ENABLED",
    "HOOMA_YOUTUBE_API_NETWORK_ENABLED",
    "HOOMA_YOUTUBE_PUBLISHING_ENABLED",
    "YOUTUBE_API_AUDIT_RECEIPT_SHA256",
  ]) assert.match(config, new RegExp(marker));
  assert.match(instagramCampaign, /shareToFacebook:\s*false/);
  assert.match(instagramCampaign, /facebookEnabled:\s*false/);
});

test("OAuth and database writes are pinned to the verified provider-specific identities", () => {
  assert.match(config, /FACEBOOK_CANONICAL_PAGE_ID = "1183394631514623"/);
  assert.match(config, /FACEBOOK_CANONICAL_PAGE_USERNAME = "hoomageorgia"/);
  assert.match(config, /YOUTUBE_CANONICAL_CHANNEL_ID = "UCDv_CqLgtUlMUfFg7VAs4aQ"/);
  assert.match(config, /YOUTUBE_CANONICAL_CHANNEL_HANDLE = "hoomastore"/);
  for (const value of [
    "1183394631514623",
    "hoomageorgia",
    "UCDv_CqLgtUlMUfFg7VAs4aQ",
    "hoomastore",
  ]) assert.match(identityMigration, new RegExp(value));
  assert.match(identityMigration, /external_account_id = 'UCDv_CqLgtUlMUfFg7VAs4aQ'/);
  assert.match(identityMigration, /revoke all on function public\.upsert_external_social_connection_v1/);
  assert.match(identityMigration, /to service_role/);
  assert.match(usernameMigration, /provider in \('tiktok', 'instagram'\) and username = 'hooma\.ge'/);
  assert.match(usernameMigration, /provider = 'facebook' and username = 'hoomageorgia'/);
  assert.match(usernameMigration, /provider = 'youtube' and username = 'hoomastore'/);
});

test("database requires owned music, exact lifecycle intent and immutable analytics horizons", () => {
  assert.match(migration, /provider = 'tiktok' or music_mode = 'HOOMA_OWNED_MASTER'/);
  assert.match(migration, /PUBLISH_INTENT_RECORDED/);
  assert.match(migration, /dispatch_allowed/);
  assert.match(publishWorker, /blocked_remote_uncertain|remote_side_effect_possible/i);
  assert.match(publishWorker, /provider === "facebook" \? 60 : 180/);
  assert.match(migration, /'T2H'/);
  assert.match(migration, /'T24H'/);
  assert.match(migration, /'T72H'/);
  assert.match(migration, /jsonb_typeof\(metric\.value\) not in \('null', 'number'\)/);
  assert.match(migration, /force row level security/);
});

test("cron runs Facebook and YouTube publishers and analytics independently", () => {
  assert.match(cron, /runFacebookPublishWorker/);
  assert.match(cron, /runFacebookAnalyticsWorker/);
  assert.match(cron, /runYouTubePublishWorker/);
  assert.match(cron, /runYouTubeAnalyticsWorker/);
});

test("credential-bearing uploads pin provider origins and verify the source binary", () => {
  assert.match(facebookProvider, /hostname !== "rupload\.facebook\.com"/);
  assert.match(facebookProvider, /redirect: "error"/);
  assert.match(youtubeProvider, /parsed\.origin !== API_ORIGIN/);
  assert.match(youtubeProvider, /uploadUrl\.origin !== API_ORIGIN/);
  assert.match(youtubeProvider, /SOURCE_BINDING_MISMATCH/);
  assert.match(youtubeProvider, /redirect: "error"/);
});

test("YouTube is refreshed by cron and on demand at both operational boundaries", () => {
  assert.match(tokenCron, /youtubeOAuthEnabled/);
  assert.match(tokenCron, /refreshYouTubeAccessToken/);
  assert.match(publishWorker, /ensureYouTubePublishingConnection/);
  assert.match(analyticsWorker, /ensureYouTubePublishingConnection/);
});
