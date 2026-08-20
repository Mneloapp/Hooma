import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("TikTok OAuth stays on the approved portal-v2 authorization contract", async () => {
  const [config, provider, callback, example, docs] = await Promise.all([
    source("lib/social/config.ts"),
    source("lib/social/providers/tiktok-oauth.ts"),
    source("app/api/social/oauth/tiktok/callback/route.ts"),
    source(".env.example"),
    source("docs/tiktok-oauth-connection.md"),
  ]);

  assert.match(config, /url\.origin !== "https:\/\/www\.tiktok\.com"/);
  assert.match(config, /url\.pathname !== "\/v2\/auth\/authorize"/);
  assert.doesNotMatch(config, /ads\.tiktok\.com.*marketing_api\/auth/);

  assert.match(provider, /url\.searchParams\.set\("client_key", config\.clientId\)/);
  assert.match(provider, /url\.searchParams\.set\("response_type", "code"\)/);
  assert.match(provider, /url\.searchParams\.set\("redirect_uri", config\.redirectUri\)/);
  assert.doesNotMatch(provider, /url\.searchParams\.set\("app_id"/);
  assert.match(provider, /auth_code: authCode/);

  assert.match(callback, /parseTikTokAuthorizationCallback\(url\.searchParams\)/);
  assert.match(callback, /exchangeTikTokAuthorizationCode\(callback\.code\)/);
  assert.doesNotMatch(callback, /boundedSingleOAuthParameter\(url\.searchParams, "auth_code"/);
  assert.doesNotMatch(callback, /get\("code"\) === "40102"/);

  assert.match(
    example,
    /TIKTOK_BUSINESS_AUTH_URL=https:\/\/www\.tiktok\.com\/v2\/auth\/authorize/,
  );
  assert.doesNotMatch(example, /ads\.tiktok\.com\/marketing_api\/auth/);
  assert.doesNotMatch(docs, /ads\.tiktok\.com\/marketing_api\/auth/);
});

test("TikTok publishing and network switches remain fail-closed by default", async () => {
  const example = await source(".env.example");
  assert.match(example, /^HOOMA_SOCIAL_PUBLISHING_ENABLED=0$/m);
  assert.match(example, /^HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED=0$/m);
  assert.match(example, /^HOOMA_TIKTOK_ORGANIC_PUBLISHING_ENABLED=0$/m);
});
