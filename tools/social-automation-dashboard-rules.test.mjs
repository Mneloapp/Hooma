import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const [page, loader, permissions, sidebar, settings, oauthRoute] = await Promise.all([
  readFile(new URL("app/admin/automations/page.tsx", root), "utf8"),
  readFile(new URL("lib/social/automation-dashboard.ts", root), "utf8"),
  readFile(new URL("lib/auth/permissions.ts", root), "utf8"),
  readFile(new URL("components/admin/AdminSidebar.tsx", root), "utf8"),
  readFile(new URL("app/admin/settings/page.tsx", root), "utf8"),
  readFile(new URL("lib/social/oauth-route.ts", root), "utf8"),
]);

test("automation dashboard is server-rendered and owner-only", () => {
  assert.doesNotMatch(page, /["']use client["']/);
  assert.match(page, /requirePermission\("team\.manage"\)/);
  assert.match(page, /actor\.role !== "owner"/);
  assert.match(permissions, /\["\/admin\/automations", "team\.manage"\]/);
  assert.match(sidebar, /\["\/admin\/automations", "ავტომატიზაციები", "team\.manage"\]/);
});

test("automation page is canonical for OAuth results and pricing stays focused", () => {
  assert.match(oauthRoute, /new URL\("\/admin\/automations", callback\.origin\)/);
  assert.doesNotMatch(settings, /social_connections|social_provider|oauth|TikTok|Instagram/i);
  assert.match(settings, /CostSettingsEditor/);
});

test("app approval, account OAuth and publishing are distinct stages", () => {
  assert.match(page, /აპის დამტკიცება/);
  assert.match(page, /ანგარიშის OAuth/);
  assert.match(page, /kill-switch გამორთულია/);
  for (const helper of [
    "socialPublishingEnabled",
    "tiktokAppReviewApproved",
    "tiktokOAuthEnabled",
    "tiktokOrganicNetworkEnabled",
    "tiktokOrganicPublishingEnabled",
  ]) {
    assert.match(loader, new RegExp(`\\b${helper}\\(`));
  }
  assert.match(loader, /status: tiktokApproved \? "approved" : "unknown"/);
  assert.match(loader, /verifiedAt: null/);
  const staleApprovedDate = ["2026", "08", "20"].join("-");
  const staleOwnerEvidence = ["owner", "verified"].join("_");
  assert.doesNotMatch(loader, new RegExp(`${staleApprovedDate}|${staleOwnerEvidence}`));

  const staleTikTokEnvironmentNames = [
    ["HOOMA_TIKTOK", "API_NETWORK_ENABLED"].join("_"),
    ["HOOMA_TIKTOK", "PUBLISHING_ENABLED"].join("_"),
  ];
  for (const staleName of staleTikTokEnvironmentNames) {
    assert.doesNotMatch(loader, new RegExp(staleName));
  }
});

test("dashboard has no publishing or destructive action surface", () => {
  assert.doesNotMatch(page, /<form|<button|action=|use server|ServerAction/);
  assert.doesNotMatch(loader, /\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/);
  assert.match(page, /გამოქვეყნების, წაშლის, boost-ის ან ხარჯვის კონტროლი აქ არ არსებობს/);
  assert.match(page, /href="\/admin\/automations\/instagram-canary"/);
  assert.match(page, /Instagram-ის უსაფრთხო შემოწმება/);
});

test("loader selects only sanitized fields and never client-exposes flags", () => {
  for (const forbidden of ["access_token_enc", "refresh_token_enc", "external_account_id", "account_id", "provider_post_id", "provider_publish_id", "caption", "video_object_path", "content_fingerprint"]) {
    assert.doesNotMatch(loader, new RegExp(forbidden));
  }
  assert.doesNotMatch(loader, /NEXT_PUBLIC_.*(?:PUBLISH|TIKTOK|INSTAGRAM|SOCIAL)/);
  assert.match(loader, /safeNumber/);
  assert.match(loader, /ANALYTICS_SNAPSHOT/);
});

test("missing data stays unavailable instead of becoming a fake zero", () => {
  assert.match(page, /data\.warningCodes\.length > 0/);
  assert.match(page, /data\.availability\.(?:jobs|connections|metrics)/);
  assert.match(page, /მეტრიკები დროებით მიუწვდომელია — ეს არ ნიშნავს ნულს/);
  assert.match(page, /რიგის მონაცემები მიუწვდომელია/);
  assert.match(page, /აუდიტისა და ქვითრების მონაცემები დროებით მიუწვდომელია/);
  assert.match(loader, /SERVER_DATA_ACCESS_UNAVAILABLE/);
  assert.match(loader, /setupReady: false/);
  for (const section of ["connections", "jobs", "receipts", "audit", "metrics"]) {
    assert.match(loader, new RegExp(`${section}: false`));
  }
  assert.match(loader, /setupReady: Object\.values\(availability\)\.every\(Boolean\)/);
});

test("blocked terminal jobs never inflate the active queue or show a green no-blocker result", () => {
  assert.match(loader, /terminalStates = new Set\(\["published", "failed", "cancelled", "blocked_policy", "blocked_remote_uncertain"\]\)/);
  assert.match(loader, /export function isTerminalAutomationJobState/);
  assert.match(page, /!isTerminalAutomationJobState\(job\.state\)/);
  assert.match(page, /blocked_policy: "პოლიტიკის ბლოკირება აქტიურია"/);
  assert.match(page, /blocked_remote_uncertain: "დისტანციური შედეგი ხელით შესამოწმებელია"/);
  assert.doesNotMatch(page, /displayedTerminalStates/);
});

test("due-time duplicate preflight is not reported as a waiting queue blocker", () => {
  assert.doesNotMatch(loader, /blockers\.push\("დისტანციური დუბლიკატი ჯერ არ შემოწმებულა"\)/);
});

test("dashboard shows today's schedule and never truncates the canonical queue", () => {
  assert.match(page, /დღევანდელი განრიგი/);
  assert.match(page, /Today · Asia\/Tbilisi/);
  assert.match(page, /queueJobs\.map/);
  assert.doesNotMatch(page, /data\.jobs\.slice\(0,\s*10\)/);
  assert.match(page, /სრული გამოსაქვეყნებელი რიგი/);
  assert.match(page, /job\.productName/);
  assert.match(loader, /product:products!social_publish_jobs_product_id_fkey\(name_ka,hooma_name\)/);
  assert.match(loader, /productName: safeProductName\(row\.product\)/);
});
