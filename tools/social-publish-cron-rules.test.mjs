import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [route, vercel] = await Promise.all([
  readFile(new URL("app/api/cron/social-publish/route.ts", root), "utf8"),
  readFile(new URL("vercel.json", root), "utf8").then(JSON.parse),
]);

test("social publishing has one unambiguous half-hour cron schedule", () => {
  const socialCrons = vercel.crons.filter((cron) => cron.path === "/api/cron/social-publish");
  assert.deepEqual(socialCrons, [{ path: "/api/cron/social-publish", schedule: "*/30 * * * *" }]);
});

test("cron emits sanitized worker heartbeat diagnostics", () => {
  assert.match(route, /social_publish_cron_result/);
  assert.match(route, /resultStatus/);
  assert.match(route, /errorCode/);
  assert.doesNotMatch(route, /postId.*console\.info/s);
});
