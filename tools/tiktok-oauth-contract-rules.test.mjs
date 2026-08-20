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

test("TikTok callback audit diagnostics are stage-aware and strictly sanitized", async () => {
  const [callback, providerClient, connections, docs] = await Promise.all([
    source("app/api/social/oauth/tiktok/callback/route.ts"),
    source("lib/social/provider-client.ts"),
    source("lib/social/connections.ts"),
    source("docs/tiktok-oauth-connection.md"),
  ]);

  assert.match(callback, /let failureStage: SocialOAuthFailureStage = "authorization"/);
  assert.match(callback, /failureStage = "token_exchange"/);
  assert.match(callback, /failureStage = "identity"/);
  assert.match(callback, /failureStage = "connection_store"/);
  const catchStart = callback.indexOf("} catch (error) {");
  const catchEnd = callback.indexOf(
    'return oauthResultRedirect("tiktok", "failed")',
    catchStart,
  );
  assert.notEqual(catchStart, -1);
  assert.notEqual(catchEnd, -1);
  const failureHandler = callback.slice(catchStart, catchEnd);
  assert.match(failureHandler, /providerErrorAuditDiagnostic\(error, failureStage\)/);
  assert.match(failureHandler, /failureStage: diagnostic\.failureStage/);
  assert.match(failureHandler, /providerRequestId: diagnostic\.providerRequestId/);
  assert.doesNotMatch(failureHandler, /providerErrorCode|error\.message|callback\.code|\bstate\b|JSON\.stringify/);

  const diagnosticStart = providerClient.indexOf("export function providerErrorAuditDiagnostic");
  const diagnosticEnd = providerClient.indexOf("export function socialOAuthAuditMetadata");
  const diagnosticHelper = providerClient.slice(diagnosticStart, diagnosticEnd);
  assert.match(diagnosticHelper, /error instanceof SocialProviderError/);
  assert.match(diagnosticHelper, /providerErrorCode\(error\)/);
  assert.match(diagnosticHelper, /SOCIAL_OAUTH_PLAIN_ERROR_CODES\.has\(plainInternalCode\)/);
  assert.match(diagnosticHelper, /: "UNEXPECTED_FAILURE"/);
  assert.doesNotMatch(diagnosticHelper, /error\.message|JSON\.stringify/);
  assert.match(providerClient, /SOCIAL_OAUTH_FAILURE_STAGES\.has\(diagnostic\.failureStage\)/);
  assert.match(providerClient, /metadata\.provider_request_id = providerRequestId/);

  assert.match(
    connections,
    /metadata: socialOAuthAuditMetadata\(provider, errorCode, diagnostic\)/,
  );
  assert.doesNotMatch(connections, /metadata: \{ provider, error_code: safeCode \}/);

  assert.match(docs, /Authorization codes, OAuth\s+state, client secrets/);
  assert.match(docs, /raw `error\.message` values are never written or logged/);
});
