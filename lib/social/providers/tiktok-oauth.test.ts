import assert from "node:assert/strict";
import test from "node:test";

import {
  providerConfig,
  socialPublishingEnabled,
  TIKTOK_APPROVED_ACCOUNT_SCOPES,
  TIKTOK_APPROVED_APP_ID,
  tiktokAppReviewApproved,
  tiktokOAuthEnabled,
  tiktokOrganicNetworkEnabled,
  tiktokOrganicPublishingEnabled,
} from "../config";
import {
  isProviderAuthenticationFailure,
  providerErrorAuditDiagnostic,
  socialOAuthAuditMetadata,
  SocialProviderError,
} from "../provider-client";
import { boundedSingleOAuthParameter } from "../oauth-route";
import {
  buildTikTokAuthorizationUrl,
  exchangeTikTokAuthorizationCode,
  getTikTokOAuthIdentity,
  parseTikTokAuthorizationCallback,
  parseTikTokIdentityResponse,
  parseTikTokReturnedScopes,
  parseTikTokTokenResponse,
  refreshTikTokAccessToken,
} from "./tiktok-oauth";

const APPROVED_SCOPES = [...TIKTOK_APPROVED_ACCOUNT_SCOPES];

function installTikTokEnvironment() {
  process.env.TIKTOK_BUSINESS_CLIENT_ID = TIKTOK_APPROVED_APP_ID;
  process.env.TIKTOK_BUSINESS_CLIENT_SECRET = "test-client-secret";
  process.env.TIKTOK_BUSINESS_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize";
  process.env.TIKTOK_BUSINESS_REDIRECT_URI = "https://hooma.ge/api/social/oauth/tiktok/callback/";
  process.env.TIKTOK_BUSINESS_APPROVED_SCOPES = APPROVED_SCOPES.join(",");
  process.env.TIKTOK_BUSINESS_EXPECTED_USERNAME = "@Hooma.Ge";
  process.env.TIKTOK_BUSINESS_APP_REVIEW_STATUS = "APPROVED";
  process.env.TIKTOK_BUSINESS_APP_REVIEW_RECEIPT_SHA256 = "a".repeat(64);
}

function tokenResponse(scope = [...APPROVED_SCOPES].reverse().join(",")) {
  return {
    code: 0,
    message: "OK",
    request_id: "request-id",
    data: {
      access_token: "sensitive-access-token",
      expires_in: 86_400,
      open_id: "account-open-id",
      refresh_token: "sensitive-refresh-token",
      refresh_token_expires_in: 31_536_000,
      scope,
      token_type: "Bearer",
    },
  };
}

test("TikTok callback is the exact approved trailing-slash URI", () => {
  installTikTokEnvironment();
  assert.equal(
    providerConfig("tiktok").redirectUri,
    "https://hooma.ge/api/social/oauth/tiktok/callback/",
  );

  process.env.TIKTOK_BUSINESS_REDIRECT_URI = "https://hooma.ge/api/social/oauth/tiktok/callback";
  assert.throws(
    () => providerConfig("tiktok"),
    /SOCIAL_CONFIG_INVALID_REDIRECT:TIKTOK_BUSINESS_REDIRECT_URI/,
  );
});

test("TikTok callback parameters accept only one portal-v2 code", () => {
  const valid = new URLSearchParams({ state: "one-state", code: "one-code" });
  assert.equal(boundedSingleOAuthParameter(valid, "state", 256), "one-state");
  assert.deepEqual(parseTikTokAuthorizationCallback(valid), {
    kind: "authorized",
    code: "one-code",
  });

  const duplicated = new URLSearchParams("state=first&state=second");
  assert.equal(boundedSingleOAuthParameter(duplicated, "state", 256), null);

  const controlled = new URLSearchParams();
  controlled.append("code", "bad\u0000code");
  assert.throws(
    () => parseTikTokAuthorizationCallback(controlled),
    /AUTHORIZATION_CODE_MISSING/,
  );

  for (const invalid of [
    new URLSearchParams("code=first&code=second"),
    new URLSearchParams({ code: "x".repeat(4_097) }),
    new URLSearchParams(),
  ]) {
    assert.throws(
      () => parseTikTokAuthorizationCallback(invalid),
      /AUTHORIZATION_CODE_MISSING/,
    );
  }
});

test("TikTok callback rejects legacy and hybrid authorization surfaces", () => {
  for (const invalid of [
    new URLSearchParams({ auth_code: "legacy-code" }),
    new URLSearchParams({ code: "portal-code", auth_code: "legacy-code" }),
  ]) {
    assert.throws(
      () => parseTikTokAuthorizationCallback(invalid),
      /LEGACY_AUTHORIZATION_RESPONSE/,
    );
  }

  assert.deepEqual(
    parseTikTokAuthorizationCallback(new URLSearchParams({ code: "40102" })),
    { kind: "authorized", code: "40102" },
  );
});

test("explicit TikTok provider errors remain denials and win over code", () => {
  for (const name of ["error", "error_description", "error_reason", "error_code"]) {
    const parameters = new URLSearchParams({ code: "must-not-be-used" });
    parameters.set(name, "provider-denied");
    assert.deepEqual(parseTikTokAuthorizationCallback(parameters), { kind: "denied" });
  }
});

test("TikTok account-holder authorization uses the approved portal-v2 contract", () => {
  installTikTokEnvironment();
  const url = buildTikTokAuthorizationUrl("state-value");
  assert.equal(url.origin, "https://www.tiktok.com");
  assert.equal(url.pathname, "/v2/auth/authorize");
  assert.equal(url.searchParams.get("client_key"), TIKTOK_APPROVED_APP_ID);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("scope"), APPROVED_SCOPES.join(","));
  assert.equal(url.searchParams.get("state"), "state-value");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://hooma.ge/api/social/oauth/tiktok/callback/",
  );
  assert.deepEqual(
    [...url.searchParams.keys()].sort(),
    ["client_key", "redirect_uri", "response_type", "scope", "state"],
  );
  assert.equal(url.searchParams.has("app_id"), false);
  assert.equal(url.toString().includes("test-client-secret"), false);
});

test("returned TikTok scope identifiers are preserved exactly and fail closed", () => {
  assert.deepEqual(
    parseTikTokReturnedScopes("video.publish,user.info.basic"),
    ["user.info.basic", "video.publish"],
  );
  assert.equal(parseTikTokReturnedScopes(["user.info.basic"]), null);
  assert.equal(parseTikTokReturnedScopes("Account Post Content > Video Publish"), null);
  assert.equal(parseTikTokReturnedScopes("user.info.basic,"), null);
});

test("configuration accepts only the exact approved portal-v2 authorization endpoint", () => {
  installTikTokEnvironment();
  assert.equal(
    providerConfig("tiktok").authorizationUrl,
    "https://www.tiktok.com/v2/auth/authorize",
  );

  for (const invalid of [
    "https://ads.tiktok.com/marketing_api/auth",
    "https://www.tiktok.com/v2/auth/authorize/",
    "https://tiktok.com/v2/auth/authorize",
    "https://www.tiktok.com/v2/auth/another",
    "https://www.tiktok.com/v2/auth/authorize?prefilled=1",
    "https://www.tiktok.com/v2/auth/authorize#fragment",
    "https://user:pass@www.tiktok.com/v2/auth/authorize",
  ]) {
    installTikTokEnvironment();
    process.env.TIKTOK_BUSINESS_AUTH_URL = invalid;
    assert.throws(
      () => providerConfig("tiktok"),
      /SOCIAL_CONFIG_INVALID_(?:AUTHORIZATION_URL|HTTPS):TIKTOK_BUSINESS_AUTH_URL/,
    );
  }
});

test("configuration rejects approved scope and App ID drift", () => {
  installTikTokEnvironment();
  process.env.TIKTOK_BUSINESS_APPROVED_SCOPES = APPROVED_SCOPES.slice(1).join(",");
  assert.throws(
    () => providerConfig("tiktok"),
    /SOCIAL_CONFIG_INVALID_APPROVED_SCOPES:TIKTOK_BUSINESS_APPROVED_SCOPES/,
  );

  installTikTokEnvironment();
  process.env.TIKTOK_BUSINESS_CLIENT_ID = "another-approved-looking-app";
  assert.throws(
    () => providerConfig("tiktok"),
    /SOCIAL_CONFIG_INVALID_APP:TIKTOK_BUSINESS_CLIENT_ID/,
  );
});

test("token parsing accepts only the configured approved returned identifiers", () => {
  installTikTokEnvironment();
  assert.deepEqual(parseTikTokTokenResponse(tokenResponse()), {
    accessToken: "sensitive-access-token",
    expiresIn: 86_400,
    openId: "account-open-id",
    refreshToken: "sensitive-refresh-token",
    refreshTokenExpiresIn: 31_536_000,
    scopes: [...APPROVED_SCOPES].sort(),
    tokenType: "Bearer",
  });

  assert.throws(
    () => parseTikTokTokenResponse(tokenResponse(APPROVED_SCOPES.slice(1).join(","))),
    (error: unknown) => error instanceof Error
      && error.message === "SOCIAL_PROVIDER_ERROR:tiktok:token_exchange:APPROVED_SCOPE_SET_MISMATCH"
      && !error.message.includes("sensitive-access-token")
      && !error.message.includes("test-client-secret"),
  );

  assert.throws(
    () => parseTikTokTokenResponse(tokenResponse(
      `${APPROVED_SCOPES.join(",")},unexpected.extra.scope`,
    )),
    /SOCIAL_PROVIDER_ERROR:tiktok:token_exchange:APPROVED_SCOPE_SET_MISMATCH/,
  );
});

test("token exchange sends the exact callback and no scope override", async () => {
  installTikTokEnvironment();
  const originalFetch = globalThis.fetch;
  const observedUrls: URL[] = [];
  const observedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    observedUrls.push(new URL(String(input)));
    observedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return Response.json(tokenResponse());
  };
  try {
    await exchangeTikTokAuthorizationCode("one-time-code");
    assert.equal(
      observedUrls[0]?.toString(),
      "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/token/",
    );
    assert.deepEqual(observedBodies[0], {
      client_id: TIKTOK_APPROVED_APP_ID,
      client_secret: "test-client-secret",
      grant_type: "authorization_code",
      auth_code: "one-time-code",
      redirect_uri: "https://hooma.ge/api/social/oauth/tiktok/callback/",
    });
    assert.equal("scope" in (observedBodies[0] ?? {}), false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("TikTok token failures expose only allowlisted audit diagnostics", async () => {
  installTikTokEnvironment();
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    code: 40131,
    message: "provider-body-secret",
    request_id: "request-safe-id",
    data: {
      access_token: "provider-body-access-token",
      refresh_token: "provider-body-refresh-token",
    },
  });
  try {
    const error = await exchangeTikTokAuthorizationCode("callback-code-secret")
      .then(() => null, (caught: unknown) => caught);
    assert.ok(error instanceof SocialProviderError);

    const diagnostic = providerErrorAuditDiagnostic(error, "authorization");
    assert.deepEqual(diagnostic, {
      errorCode: "40131",
      failureStage: "token_exchange",
      providerRequestId: "request-safe-id",
    });
    const metadata = socialOAuthAuditMetadata(
      "tiktok",
      diagnostic.errorCode,
      {
        failureStage: diagnostic.failureStage,
        providerRequestId: diagnostic.providerRequestId,
      },
    );
    assert.deepEqual(metadata, {
      provider: "tiktok",
      error_code: "40131",
      failure_stage: "token_exchange",
      provider_request_id: "request-safe-id",
    });

    const serialized = JSON.stringify({ diagnostic, metadata });
    for (const secret of [
      "callback-code-secret",
      "test-client-secret",
      "provider-body-secret",
      "provider-body-access-token",
      "provider-body-refresh-token",
    ]) {
      assert.equal(serialized.includes(secret), false);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("OAuth audit diagnostics reject untrusted messages, stages, and request IDs", () => {
  const unknown = providerErrorAuditDiagnostic(
    new Error("raw provider body secret"),
    "connection_store",
  );
  assert.deepEqual(unknown, {
    errorCode: "UNEXPECTED_FAILURE",
    failureStage: "connection_store",
    providerRequestId: null,
  });
  assert.equal(JSON.stringify(unknown).includes("raw provider body secret"), false);
  assert.equal(
    providerErrorAuditDiagnostic(
      new Error("SOCIAL_SECRET_LOOKING_RAW_MESSAGE"),
      "connection_store",
    ).errorCode,
    "UNEXPECTED_FAILURE",
  );

  const storeFailure = providerErrorAuditDiagnostic(
    new Error("SOCIAL_CONNECTION_STORE_FAILED:23505"),
    "connection_store",
  );
  assert.deepEqual(storeFailure, {
    errorCode: "SOCIAL_CONNECTION_STORE_FAILED",
    failureStage: "connection_store",
    providerRequestId: null,
  });
  assert.equal(JSON.stringify(storeFailure).includes("23505"), false);

  const metadata = socialOAuthAuditMetadata(
    "tiktok",
    "40131\nraw-code-secret",
    {
      failureStage: "token_exchange\nraw-stage-secret",
      providerRequestId: "request-id\nraw-request-secret",
    },
  );
  assert.deepEqual(metadata, {
    provider: "tiktok",
    error_code: "UNEXPECTED_FAILURE",
  });

  for (const requestId of [
    " request-id ",
    "request/id",
    "request?id=secret",
    "request-id\nraw-request-secret",
    "x".repeat(121),
    "UNAVAILABLE",
  ]) {
    const invalidRequestId = new SocialProviderError({
      provider: "tiktok",
      stage: "token_exchange",
      code: "40131",
      requestId,
    });
    assert.equal(invalidRequestId.requestId, null);
    assert.deepEqual(
      socialOAuthAuditMetadata("tiktok", "40131", { providerRequestId: requestId }),
      { provider: "tiktok", error_code: "40131" },
    );
  }
  assert.deepEqual(
    socialOAuthAuditMetadata("tiktok", "40131", { providerRequestId: 40131 }),
    { provider: "tiktok", error_code: "40131" },
  );
});

test("TikTok identity failures retain the provider stage and request ID", () => {
  let identityError: unknown;
  try {
    parseTikTokIdentityResponse({
      code: 40131,
      message: "identity-provider-body-secret",
      request_id: "identity-request-id",
    }, "expected-account-id");
  } catch (error) {
    identityError = error;
  }
  assert.deepEqual(providerErrorAuditDiagnostic(identityError, "token_exchange"), {
    errorCode: "40131",
    failureStage: "identity",
    providerRequestId: "identity-request-id",
  });
});

test("token refresh validates identity and returns TikTok's rotated token pair", async () => {
  installTikTokEnvironment();
  const originalFetch = globalThis.fetch;
  const observedUrls: URL[] = [];
  const observedBodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = async (input, init) => {
    observedUrls.push(new URL(String(input)));
    observedBodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    const response = tokenResponse();
    response.data.access_token = "rotated-access-token";
    response.data.refresh_token = "rotated-refresh-token";
    return Response.json(response);
  };
  try {
    const token = await refreshTikTokAccessToken(
      "previous-refresh-token",
      "account-open-id",
    );
    assert.equal(
      observedUrls[0]?.toString(),
      "https://business-api.tiktok.com/open_api/v1.3/tt_user/oauth2/refresh_token/",
    );
    assert.deepEqual(observedBodies[0], {
      client_id: TIKTOK_APPROVED_APP_ID,
      client_secret: "test-client-secret",
      grant_type: "refresh_token",
      refresh_token: "previous-refresh-token",
    });
    assert.equal(token.accessToken, "rotated-access-token");
    assert.equal(token.refreshToken, "rotated-refresh-token");
    assert.equal(token.openId, "account-open-id");
    assert.deepEqual(token.scopes, [...APPROVED_SCOPES].sort());
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("token refresh rejects account drift, missing scopes, and invalid token pairs", async () => {
  installTikTokEnvironment();
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      const response = tokenResponse();
      response.data.open_id = "another-account";
      return Response.json(response);
    };
    const identityMismatch = await refreshTikTokAccessToken(
      "previous-refresh-token",
      "account-open-id",
    ).then(() => null, (error: unknown) => error);
    assert.match(
      String(identityMismatch),
      /SOCIAL_PROVIDER_ERROR:tiktok:token_refresh:REFRESH_IDENTITY_MISMATCH/,
    );
    assert.equal(isProviderAuthenticationFailure(identityMismatch), true);

    globalThis.fetch = async () => Response.json(tokenResponse(
      APPROVED_SCOPES.slice(1).join(","),
    ));
    const missingScope = await refreshTikTokAccessToken(
      "previous-refresh-token",
      "account-open-id",
    ).then(() => null, (error: unknown) => error);
    assert.match(
      String(missingScope),
      /SOCIAL_PROVIDER_ERROR:tiktok:token_refresh:APPROVED_SCOPE_SET_MISMATCH/,
    );
    assert.equal(isProviderAuthenticationFailure(missingScope), true);

    globalThis.fetch = async () => Response.json(tokenResponse(
      `${APPROVED_SCOPES.join(",")},unexpected.extra.scope`,
    ));
    const extraScope = await refreshTikTokAccessToken(
      "previous-refresh-token",
      "account-open-id",
    ).then(() => null, (error: unknown) => error);
    assert.match(
      String(extraScope),
      /SOCIAL_PROVIDER_ERROR:tiktok:token_refresh:APPROVED_SCOPE_SET_MISMATCH/,
    );
    assert.equal(isProviderAuthenticationFailure(extraScope), true);

    const invalidPair = tokenResponse();
    invalidPair.data.refresh_token = invalidPair.data.access_token;
    assert.throws(
      () => parseTikTokTokenResponse(invalidPair, "token_refresh"),
      /SOCIAL_PROVIDER_ERROR:tiktok:token_refresh:INVALID_TOKEN_RESPONSE/,
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("identity parsing and lookup bind the connection to @hooma.ge", async () => {
  installTikTokEnvironment();
  const identityBody = {
    code: 0,
    request_id: "identity-request-id",
    data: {
      business_id: "account-open-id",
      username: "@Hooma.Ge",
      display_name: "Hooma",
    },
  };
  assert.deepEqual(parseTikTokIdentityResponse(identityBody, "account-open-id"), {
    accountId: "account-open-id",
    username: "hooma.ge",
    displayName: "Hooma",
  });
  assert.throws(
    () => parseTikTokIdentityResponse({
      ...identityBody,
      data: { ...identityBody.data, username: "another.account" },
    }, "account-open-id"),
    /ACCOUNT_IDENTITY_MISMATCH/,
  );

  const originalFetch = globalThis.fetch;
  const observedUrls: URL[] = [];
  const observedAccessTokens: Array<string | null> = [];
  globalThis.fetch = async (input, init) => {
    observedUrls.push(new URL(String(input)));
    observedAccessTokens.push(new Headers(init?.headers).get("access-token"));
    return Response.json(identityBody);
  };
  try {
    await getTikTokOAuthIdentity("identity-access-token", "account-open-id");
    assert.equal(observedUrls[0]?.pathname, "/open_api/v1.3/business/get/");
    assert.equal(observedUrls[0]?.searchParams.get("business_id"), "account-open-id");
    assert.equal(observedAccessTokens[0], "identity-access-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("account and feature gates fail closed", () => {
  installTikTokEnvironment();
  process.env.TIKTOK_BUSINESS_EXPECTED_USERNAME = "another.account";
  assert.throws(
    () => providerConfig("tiktok"),
    /SOCIAL_CONFIG_INVALID_ACCOUNT:TIKTOK_BUSINESS_EXPECTED_USERNAME/,
  );

  delete process.env.HOOMA_SOCIAL_PUBLISHING_ENABLED;
  delete process.env.HOOMA_TIKTOK_OAUTH_ENABLED;
  delete process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED;
  delete process.env.HOOMA_TIKTOK_ORGANIC_PUBLISHING_ENABLED;
  assert.equal(socialPublishingEnabled(), false);
  assert.equal(tiktokAppReviewApproved(), true);
  assert.equal(tiktokOAuthEnabled(), false);
  assert.equal(tiktokOrganicNetworkEnabled(), false);
  assert.equal(tiktokOrganicPublishingEnabled(), false);
  process.env.HOOMA_SOCIAL_PUBLISHING_ENABLED = "true";
  process.env.HOOMA_TIKTOK_OAUTH_ENABLED = "true";
  assert.equal(socialPublishingEnabled(), false);
  assert.equal(tiktokOAuthEnabled(), false);
  process.env.HOOMA_TIKTOK_OAUTH_ENABLED = "1";
  assert.equal(tiktokOAuthEnabled(), true);
  assert.equal(socialPublishingEnabled(), false);

  process.env.TIKTOK_BUSINESS_APP_REVIEW_STATUS = "PENDING";
  assert.equal(tiktokAppReviewApproved(), false);
  assert.equal(tiktokOAuthEnabled(), false);
  process.env.TIKTOK_BUSINESS_APP_REVIEW_STATUS = "APPROVED";
  process.env.TIKTOK_BUSINESS_APP_REVIEW_RECEIPT_SHA256 = "invalid";
  assert.equal(tiktokAppReviewApproved(), false);
  assert.equal(tiktokOAuthEnabled(), false);

  process.env.TIKTOK_BUSINESS_APP_REVIEW_RECEIPT_SHA256 = "a".repeat(64);
  process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED = "1";
  process.env.HOOMA_TIKTOK_ORGANIC_PUBLISHING_ENABLED = "1";
  assert.equal(tiktokOrganicNetworkEnabled(), true);
  assert.equal(tiktokOrganicPublishingEnabled(), false);
  process.env.HOOMA_SOCIAL_PUBLISHING_ENABLED = "1";
  assert.equal(tiktokOrganicPublishingEnabled(), true);
});
