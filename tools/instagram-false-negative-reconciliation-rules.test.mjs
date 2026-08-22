import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [worker, provider, migration] = await Promise.all([
  readFile(new URL("lib/social/instagram-publish-worker.ts", root), "utf8"),
  readFile(new URL("lib/social/providers/instagram-reels-read.ts", root), "utf8"),
  readFile(new URL("supabase/migrations/20260822000200_correct_instagram_false_negative_reconciliation.sql", root), "utf8"),
]);

test("worker and owned-media reader hash the same provider-canonical caption", () => {
  assert.match(provider, /export function canonicalInstagramCaption/);
  assert.match(provider, /replace\(\/\\r\\n\?\/g, "\\n"\)\.trimEnd\(\)/);
  assert.match(provider, /sha256Text\(canonicalInstagramCaption\(caption\)\)/);
  assert.match(worker, /sha256\(canonicalInstagramCaption\(job\.caption\)\)/);
});

test("false-negative correction is narrow, audited and cannot dispatch", () => {
  assert.match(migration, /selected_job\.state <> 'failed'/);
  assert.match(migration, /INSTAGRAM_REMOTE_PUBLISH_NOT_FOUND/);
  assert.match(migration, /selected_lifecycle\.phase <> 'MEDIA_PUBLISH_REJECTED'/);
  assert.match(migration, /selected_lifecycle\.media_publish_outcome <> 'REJECTED_NO_SIDE_EFFECT'/);
  assert.match(migration, /requested_published_at < selected_job\.scheduled_at/);
  assert.match(migration, /requested_published_at > selected_job\.publish_not_after/);
  assert.match(migration, /'REMOTE_VERIFIED'/);
  assert.match(migration, /remote_dispatch_allowed', false/);
  assert.match(migration, /to service_role/);
  assert.doesNotMatch(migration, /\bnet\.|http_(?:get|post)|graph\.instagram\.com/i);
});
