import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [route, workflow] = await Promise.all([
  readFile(new URL("app/api/cron/social-publish/route.ts", root), "utf8"),
  readFile(new URL(".github/workflows/social-publish-cron.yml", root), "utf8"),
]);

test("external heartbeat invokes the authenticated social worker every 30 minutes", () => {
  assert.match(workflow, /cron: "\*\/30 \* \* \* \*"/);
  assert.match(workflow, /secrets\.HOOMA_CRON_SECRET/);
  assert.match(workflow, /Authorization: Bearer \$\{HOOMA_CRON_SECRET\}/);
  assert.match(workflow, /https:\/\/hooma\.ge\/api\/cron\/social-publish/);
  assert.match(workflow, /test "\$status" = "200"/);
  assert.match(workflow, /\.ok == true and \.status == "COMPLETE"/);
  assert.match(workflow, /HOOMA_CRON_SECRET is not configured/);
  assert.match(workflow, /Hooma social worker HTTP \$\{status\}: \$\{summary\}/);
  assert.match(workflow, /errorCode: \.instagram\.publishing\.result\.errorCode/);
  assert.doesNotMatch(workflow, /cat "\$response_file"/);
});

test("cron emits sanitized worker heartbeat diagnostics", () => {
  assert.match(route, /social_publish_cron_result/);
  assert.match(route, /resultStatus/);
  assert.match(route, /errorCode/);
  assert.doesNotMatch(route, /postId.*console\.info/s);
});
