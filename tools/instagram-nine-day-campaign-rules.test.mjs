import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

const manifest = readFileSync(
  "lib/social/campaigns/instagram-nine-day-2026-08-22.ts",
  "utf8",
);
const ticket = readFileSync(
  "app/api/social/instagram/campaign-2026-08-22/upload-ticket/route.ts",
  "utf8",
);
const finalize = readFileSync(
  "app/api/social/instagram/campaign-2026-08-22/finalize/route.ts",
  "utf8",
);
const client = readFileSync(
  "app/admin/automations/instagram-launch/launch-client.tsx",
  "utf8",
);

test("campaign freezes nine exact media, captions and staggered schedules", () => {
  const postIds = [...manifest.matchAll(/postId: "(P-[A-Z0-9-]+)"/g)].map((match) => match[1]);
  assert.equal(postIds.length, 9);
  assert.equal(new Set(postIds).size, 9);

  const captions = [...manifest.matchAll(/caption: ("(?:[^"\\]|\\.)*"),\n\s+captionSha256: "([a-f0-9]{64})"/g)];
  assert.equal(captions.length, 9);
  for (const [, encoded, expected] of captions) {
    const caption = JSON.parse(encoded);
    assert.equal(createHash("sha256").update(caption, "utf8").digest("hex"), expected);
  }

  const scheduled = [...manifest.matchAll(/scheduledAt: "([^"]+)"/g)].map((match) => match[1]);
  assert.equal(scheduled.length, 9);
  assert.equal(new Set(scheduled.map((value) => value.slice(11, 16))).size, 9);
  assert.deepEqual(
    scheduled.map((value) => value.slice(11, 16)),
    ["12:30", "20:30", "18:30", "21:00", "13:00", "19:30", "21:30", "17:30", "20:00"],
  );
});

test("owner upload surface is exact-origin, private and hash bound", () => {
  for (const source of [ticket, finalize]) {
    assert.match(source, /request\.url\)\.origin !== "https:\/\/hooma\.ge"/);
    assert.match(source, /requirePermission\("team\.manage"\)/);
    assert.match(source, /actor\.role !== "owner"/);
  }
  assert.match(ticket, /SOCIAL_STAGING_BUCKET/);
  assert.match(ticket, /createSignedUploadUrl\(item\.videoObjectPath/);
  assert.match(ticket, /createSignedUploadUrl\(item\.coverObjectPath/);
  assert.doesNotMatch(ticket, /access[_-]?token|client[_-]?secret|service[_-]?role/i);
  assert.match(client, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(client, /videoSha256 !== item\.videoSha256/);
  assert.match(client, /coverSha256 !== item\.coverSha256/);
  assert.match(finalize, /STAGED_MEDIA_HASH_MISMATCH/);
  assert.match(finalize, /productPageAvailable\(item\)/);
});

test("finalization records owner rights, exact approval and no Facebook sharing", () => {
  assert.match(manifest, /scope: "USE_AND_UPLOAD_ALL_NINE_EXACT_CAMPAIGN_MASTERS"/);
  assert.match(finalize, /rights_status: "CLEARED"/);
  assert.match(finalize, /visual_claims_status: "CLEARED"/);
  assert.match(manifest, /shareToFacebook: false/);
  assert.match(manifest, /facebookEnabled: false/);
  assert.match(finalize, /approval_status: "WAITING_FOR_GIORGI"/);
  assert.match(finalize, /publishing_allowed: false/);
  assert.match(finalize, /approve_social_publish_job/);
  assert.match(finalize, /approved\.approval_status !== "APPROVED_EXACT"/);
  assert.match(finalize, /analyticsSnapshotsHours: \[2, 24, 72\]/);
  assert.doesNotMatch(`${manifest}\n${ticket}\n${finalize}\n${client}`, /\b(delete|boost|promote|spend)\b/i);
});
