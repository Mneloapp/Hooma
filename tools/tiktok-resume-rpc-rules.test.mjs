import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(
  new URL("../supabase/migrations/20260822000100_fix_tiktok_resume_claim.sql", import.meta.url),
  "utf8",
);

test("TikTok resume claim avoids PL/pgSQL identifier ambiguity", () => {
  assert.match(migration, /selected_lifecycle public\.social_tiktok_publish_lifecycles%rowtype/);
  assert.match(migration, /join public\.social_tiktok_publish_lifecycles lifecycle_row/);
  assert.doesNotMatch(migration, /declare[\s\S]*\blifecycle public\.social_tiktok_publish_lifecycles%rowtype/);
});

test("TikTok resume claim remains service-role only", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /revoke all on function public\.claim_due_tiktok_publish_work_v1\(\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.claim_due_tiktok_publish_work_v1\(\)[\s\S]*to service_role/);
});
