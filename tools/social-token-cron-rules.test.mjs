import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("Hobby-compatible daily schedules cover social token maintenance every four hours", async () => {
  const config = JSON.parse(await source("vercel.json"));
  const entries = config.crons.filter(
    (entry) => entry.path === "/api/cron/social-tokens",
  );

  assert.deepEqual(
    entries.map((entry) => entry.schedule),
    [
      "15 0 * * *",
      "15 4 * * *",
      "15 8 * * *",
      "15 12 * * *",
      "15 16 * * *",
      "15 20 * * *",
    ],
  );
  assert.equal(new Set(entries.map((entry) => entry.schedule)).size, 6);
  for (const entry of entries) {
    const [minute, hour, dayOfMonth, month, dayOfWeek] = entry.schedule.split(" ");
    assert.equal(minute, "15");
    assert.match(hour, /^(?:0|4|8|12|16|20)$/);
    assert.deepEqual([dayOfMonth, month, dayOfWeek], ["*", "*", "*"]);
    assert.doesNotMatch(`${minute} ${hour}`, /[*/,-]/);
  }
});

test("social token maintenance remains authenticated and independent from publishing", async () => {
  const route = await source("app/api/cron/social-tokens/route.ts");

  assert.match(route, /authenticateSocialCronRequest\(request\)/);
  assert.match(route, /tiktokOAuthEnabled:\s*tiktokOAuthEnabled\(\)/);
  assert.match(route, /publishingEnabled:\s*socialPublishingEnabled\(\)/);
  assert.match(route, /refreshTikTok:\s*refreshTikTokAccessToken/);
  assert.match(route, /claim:\s*claimSocialConnectionRefresh/);
  assert.doesNotMatch(route, /tiktokOrganicPublishingEnabled/);

  const connections = await source("lib/social/connections.ts");
  assert.match(connections, /requested_lease_seconds:\s*120/);
  assert.match(connections, /requested_lease_id:\s*claim\.refreshLeaseId/);
  assert.match(connections, /requested_token_version:\s*claim\.tokenVersion/);
});
