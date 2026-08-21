import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const page = readFileSync("app/admin/automations/today-tissue-crosspost/page.tsx", "utf8");
const client = readFileSync("app/admin/automations/today-tissue-crosspost/launch-client.tsx", "utf8");

test("today crosspost action is owner-only", () => {
  assert.match(page, /requirePermission\("team\.manage"\)/);
  assert.match(page, /actor\.role !== "owner"/);
  assert.match(page, /redirect\("\/admin"\)/);
});

test("client only finalizes the two frozen campaign items", () => {
  assert.match(client, /TODAY_TISSUE_CROSSPOST_ITEMS/);
  assert.match(client, /for \(const item of TODAY_TISSUE_CROSSPOST_ITEMS\)/);
  assert.match(client, /"\/api\/social\/today-tissue-crosspost-2026-08-21\/finalize"/);
  assert.match(client, /credentials: "same-origin"/);
  assert.match(client, /redirect: "error"/);
  assert.match(client, /payload\.status !== "APPROVED_EXACT"/);
  assert.doesNotMatch(client, /access_token|refresh_token|client_secret|authorization|cookie/i);
});

test("owner sees one explicit, accessible action", () => {
  assert.match(client, /type="button"/);
  assert.match(client, /disabled=\{running \|\| completed === TODAY_TISSUE_CROSSPOST_ITEMS\.length\}/);
  assert.match(client, /aria-live="polite"/);
  assert.match(client, /დღევანდელი Instagram \+ TikTok ტესტის დამტკიცება/);
});
