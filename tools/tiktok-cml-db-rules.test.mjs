import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const migration = await readFile(
  new URL("supabase/migrations/20260820000100_tiktok_cml_receipt_v1.sql", root),
  "utf8",
);
const adapter = await readFile(
  new URL("lib/social/providers/tiktok-business-organic.ts", root),
  "utf8",
);

test("database receipt contract matches the adapter's exact nested CML v1 shape", () => {
  for (const key of [
    "schemaVersion",
    "receiptType",
    "immutable",
    "status",
    "context",
    "track",
    "mix",
    "binding",
    "selectedAt",
    "validUntil",
    "selectionFingerprint",
    "musicSoundId",
    "catalogEvidenceSha256",
    "musicSoundVolume",
    "videoOriginalSoundVolume",
    "contentFingerprint",
    "approvalFingerprint",
    "videoSha256",
    "captionSha256",
  ]) {
    assert.match(migration, new RegExp(`'${key}'`));
    assert.match(adapter, new RegExp(`"${key}"`));
  }

  assert.match(migration, /schemaVersion'\)::integer <> 1/);
  assert.match(migration, /receiptType' <> 'TIKTOK_COMMERCIAL_MUSIC_SELECTION'/);
  assert.match(migration, /placement}' <> 'ORGANIC'/);
  assert.match(migration, /commercialUseAllowed}'\)::boolean is not true/);
  assert.doesNotMatch(migration, /receipt\s*->>\s*'trackId'/);
});

test("receipt binding and selection fingerprint are cryptographically checked", () => {
  assert.match(
    migration,
    /binding,contentFingerprint}' is distinct from requested_content_fingerprint/,
  );
  assert.match(
    migration,
    /binding,approvalFingerprint}' is distinct from requested_content_fingerprint/,
  );
  assert.match(
    migration,
    /binding,videoSha256}' is distinct from requested_video_sha256/,
  );
  assert.match(
    migration,
    /binding,captionSha256}' is distinct from requested_caption_sha256/,
  );
  assert.match(migration, /selection_payload := format\(/);
  assert.match(
    migration,
    /extensions\.digest\(convert_to\(selection_payload, 'UTF8'\), 'sha256'\)/,
  );
  assert.match(
    migration,
    /receipt ->> 'selectionFingerprint' = calculated_selection_fingerprint/,
  );
  assert.match(migration, /selectedAt'\)::timestamptz > now\(\) \+ interval '5 minutes'/);
  assert.match(migration, /validUntil'\)::timestamptz <= now\(\)/);
});

test("TikTok approval fingerprint has no circular receipt dependency", () => {
  const start = migration.indexOf(
    "if new.provider = 'tiktok' and new.music_mode = 'TIKTOK_CML' then",
  );
  const end = migration.indexOf("\n  else\n", start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const cmlApprovalHash = migration
    .slice(start, end)
    .replace(/^\s*--.*$/gm, "");

  assert.match(cmlApprovalHash, /hooma-tiktok-cml-approval-v1/);
  assert.match(cmlApprovalHash, /track,musicSoundId/);
  assert.match(cmlApprovalHash, /mix,musicSoundVolume/);
  assert.doesNotMatch(cmlApprovalHash, /\{binding,/);
  assert.doesNotMatch(cmlApprovalHash, /selectionFingerprint/);
  assert.doesNotMatch(cmlApprovalHash, /calculated_music_receipt_sha256/);
  assert.match(migration, /hooma-social-content-v2-tiktok-cml/);
  assert.match(migration, /calculated_music_approval_sha256/);
});

test("approved receipt is frozen and legacy rows remain fail-closed", () => {
  assert.match(
    migration,
    /old\.music_receipt is distinct from new\.music_receipt/,
  );
  assert.match(
    migration,
    /raise exception 'APPROVED_SOCIAL_CONTENT_CHANGED'/,
  );
  assert.match(
    migration,
    /add constraint social_publish_jobs_tiktok_cml_v1_receipt[\s\S]*not valid;/,
  );
  assert.match(
    migration,
    /public\.social_tiktok_cml_receipt_v1_is_valid\([\s\S]*content_fingerprint/,
  );
});

test("migration adds policy only and cannot invoke a provider", () => {
  assert.match(migration, /^--[\s\S]*\nbegin;/);
  assert.match(migration, /\ncommit;\s*$/);
  assert.doesNotMatch(migration, /https?:\/\//i);
  assert.doesNotMatch(migration, /fetch\s*\(|http_post|net\.http|cron\.schedule/i);
  assert.doesNotMatch(migration, /insert\s+into\s+public\.social_publish_jobs/i);
  assert.doesNotMatch(migration, /update\s+public\.social_publish_jobs/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.social_publish_jobs/i);
});
