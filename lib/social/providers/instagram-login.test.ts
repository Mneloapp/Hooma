import assert from "node:assert/strict";
import test from "node:test";

import {
  buildInstagramIdentityEndpoint,
  exchangeInstagramAuthorizationCode,
  getInstagramIdentity,
  parseInstagramIdentityJson,
  parseInstagramIdentityResponse,
  parseInstagramShortTokenJson,
  parseInstagramShortTokenResponse,
  parseInstagramUserId,
} from "./instagram-login";

const APP_SCOPED_USER_ID = "17841405793187218";
const PROFESSIONAL_ACCOUNT_ID = "17941405793187219";
const REQUIRED_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
];

function installInstagramEnvironment() {
  process.env.INSTAGRAM_APP_ID = "123456789";
  process.env.INSTAGRAM_APP_SECRET = "test-client-secret";
  process.env.INSTAGRAM_REDIRECT_URI = "https://hooma.ge/api/social/oauth/instagram/callback";
  process.env.INSTAGRAM_REQUIRED_SCOPES = REQUIRED_SCOPES.join(",");
  process.env.INSTAGRAM_EXPECTED_USERNAME = "hooma.ge";
  process.env.INSTAGRAM_GRAPH_API_VERSION = "v25.0";
}

test("Instagram user IDs preserve documented strings and safe JSON numbers", () => {
  assert.equal(parseInstagramUserId(APP_SCOPED_USER_ID), APP_SCOPED_USER_ID);
  assert.equal(parseInstagramUserId(1_234_567_890_123_456), "1234567890123456");
  assert.equal(parseInstagramUserId(Number.MAX_SAFE_INTEGER), String(Number.MAX_SAFE_INTEGER));
});

test("Instagram user IDs fail closed for values that can lose JSON precision", () => {
  assert.equal(parseInstagramUserId(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(parseInstagramUserId(1.5), null);
  assert.equal(parseInstagramUserId(0), null);
  assert.equal(parseInstagramUserId(" 123"), null);
  assert.equal(parseInstagramUserId("1e12"), null);
});

test("short token parser accepts the documented data envelope", () => {
  assert.deepEqual(parseInstagramShortTokenResponse({
    data: [{
      access_token: "short-token",
      user_id: APP_SCOPED_USER_ID,
      permissions: REQUIRED_SCOPES.join(","),
    }],
  }), {
    accessToken: "short-token",
    appScopedUserId: APP_SCOPED_USER_ID,
    scopes: [...REQUIRED_SCOPES].sort(),
  });
});

test("short token parser accepts the direct legacy response and safe numeric ID", () => {
  assert.deepEqual(parseInstagramShortTokenResponse({
    access_token: "short-token",
    user_id: 1_234_567_890_123_456,
    permissions: [...REQUIRED_SCOPES].reverse(),
  }), {
    accessToken: "short-token",
    appScopedUserId: "1234567890123456",
    scopes: [...REQUIRED_SCOPES].sort(),
  });
});

test("short token JSON parser preserves unsafe numeric Instagram user IDs exactly", () => {
  const direct = parseInstagramShortTokenJson(
    '{"access_token":"short-token","user_id":17841405793187218,"permissions":"instagram_business_basic"}',
  );
  assert.equal(
    (direct as { user_id: unknown }).user_id,
    "17841405793187218",
  );

  const enveloped = parseInstagramShortTokenJson(
    '{"data":[{"access_token":"short-token","user_id":17841405793187218,"permissions":"instagram_business_basic"}]}',
  );
  assert.equal(
    (enveloped as { data: Array<{ user_id: unknown }> }).data[0]?.user_id,
    "17841405793187218",
  );
});

test("short token JSON parser fails closed for ambiguous user ID fields", () => {
  assert.throws(
    () => parseInstagramShortTokenJson(
      '{"user_id":17841405793187218,"nested":{"user_id":17841405793187219}}',
    ),
    /AMBIGUOUS_INSTAGRAM_USER_ID_FIELDS/,
  );
  assert.throws(
    () => parseInstagramShortTokenJson(
      '{"user_id":"999","user_id":17841405793187218}',
    ),
    /AMBIGUOUS_INSTAGRAM_USER_ID_FIELDS/,
  );
});

test("short token parser rejects ambiguous envelopes and unsafe numeric IDs", () => {
  assert.equal(parseInstagramShortTokenResponse({ data: [] }), null);
  assert.equal(parseInstagramShortTokenResponse({
    data: [
      { access_token: "one", user_id: "123", permissions: REQUIRED_SCOPES },
      { access_token: "two", user_id: "456", permissions: REQUIRED_SCOPES },
    ],
  }), null);
  assert.equal(parseInstagramShortTokenResponse({
    access_token: "short-token",
    user_id: Number.MAX_SAFE_INTEGER + 1,
    permissions: REQUIRED_SCOPES,
  }), null);
});

test("identity parser separates the documented app-scoped and professional account IDs", () => {
  assert.deepEqual(parseInstagramIdentityResponse({
    data: [{
      id: APP_SCOPED_USER_ID,
      user_id: PROFESSIONAL_ACCOUNT_ID,
      username: "@Hooma.Ge",
      account_type: "Business",
    }],
  }, { appScopedUserId: APP_SCOPED_USER_ID }), {
    accountId: PROFESSIONAL_ACCOUNT_ID,
    appScopedUserId: APP_SCOPED_USER_ID,
    username: "hooma.ge",
    accountType: "Business",
  });

  assert.deepEqual(parseInstagramIdentityResponse({
    id: APP_SCOPED_USER_ID,
    user_id: PROFESSIONAL_ACCOUNT_ID,
    username: "hooma.ge",
  }, { accountId: PROFESSIONAL_ACCOUNT_ID }), {
    accountId: PROFESSIONAL_ACCOUNT_ID,
    appScopedUserId: APP_SCOPED_USER_ID,
    username: "hooma.ge",
    accountType: null,
  });
});

test("identity JSON parser preserves unsafe numeric account and app-scoped IDs", () => {
  assert.equal(
    (parseInstagramIdentityJson(
      '{"user_id":17941405793187219,"username":"hooma.ge"}',
    ) as { user_id: unknown }).user_id,
    PROFESSIONAL_ACCOUNT_ID,
  );
  assert.equal(
    (parseInstagramIdentityJson(
      '{"id":17841405793187218,"username":"hooma.ge"}',
    ) as { id: unknown }).id,
    APP_SCOPED_USER_ID,
  );
});

test("identity parser validates the expected ID namespace and requires both IDs", () => {
  assert.equal(parseInstagramIdentityResponse({
    user_id: PROFESSIONAL_ACCOUNT_ID,
    id: "999",
    username: "hooma.ge",
  }, { appScopedUserId: APP_SCOPED_USER_ID }), null);
  assert.equal(parseInstagramIdentityResponse({
    user_id: "999",
    id: APP_SCOPED_USER_ID,
    username: "hooma.ge",
  }, { accountId: PROFESSIONAL_ACCOUNT_ID }), null);
  assert.equal(parseInstagramIdentityResponse({
    user_id: PROFESSIONAL_ACCOUNT_ID,
    id: APP_SCOPED_USER_ID,
    username: "not a username",
  }, { appScopedUserId: APP_SCOPED_USER_ID }), null);
  assert.equal(parseInstagramIdentityResponse({
    user_id: PROFESSIONAL_ACCOUNT_ID,
    username: "hooma.ge",
  }, { accountId: PROFESSIONAL_ACCOUNT_ID }), null);
});

test("identity requests use the required frozen Graph API version", async () => {
  installInstagramEnvironment();
  assert.equal(
    buildInstagramIdentityEndpoint().toString(),
    "https://graph.instagram.com/v25.0/me",
  );

  const originalFetch = globalThis.fetch;
  const observedUrls: URL[] = [];
  const observedAuthorizations: Array<string | null> = [];
  globalThis.fetch = async (input, init) => {
    observedUrls.push(new URL(String(input)));
    observedAuthorizations.push(new Headers(init?.headers).get("authorization"));
    return new Response(
      '{"data":[{"id":17841405793187218,"user_id":17941405793187219,"username":"hooma.ge","account_type":"Business"}]}',
      { headers: { "content-type": "application/json" } },
    );
  };
  try {
    assert.deepEqual(await getInstagramIdentity(
      "identity-token",
      { appScopedUserId: APP_SCOPED_USER_ID },
    ), {
      accountId: PROFESSIONAL_ACCOUNT_ID,
      appScopedUserId: APP_SCOPED_USER_ID,
      username: "hooma.ge",
      accountType: "Business",
    });
    assert.equal(observedUrls[0]?.pathname, "/v25.0/me");
    assert.equal(
      observedUrls[0]?.searchParams.get("fields"),
      "id,user_id,username,account_type",
    );
    assert.equal(observedAuthorizations[0], "Bearer identity-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("missing or malformed Graph API versions fail without echoing values", () => {
  const previous = process.env.INSTAGRAM_GRAPH_API_VERSION;
  try {
    delete process.env.INSTAGRAM_GRAPH_API_VERSION;
    assert.throws(
      () => buildInstagramIdentityEndpoint(),
      /SOCIAL_CONFIG_MISSING:INSTAGRAM_GRAPH_API_VERSION/,
    );
    process.env.INSTAGRAM_GRAPH_API_VERSION = "v25.0?access_token=secret";
    assert.throws(
      () => buildInstagramIdentityEndpoint(),
      (error: unknown) => error instanceof Error
        && error.message === "SOCIAL_CONFIG_INVALID_GRAPH_VERSION:INSTAGRAM_GRAPH_API_VERSION"
        && !error.message.includes("secret"),
    );
  } finally {
    if (previous === undefined) delete process.env.INSTAGRAM_GRAPH_API_VERSION;
    else process.env.INSTAGRAM_GRAPH_API_VERSION = previous;
  }
});

test("token exchange preserves required scopes and redacts missing-scope failures", async () => {
  installInstagramEnvironment();
  const originalFetch = globalThis.fetch;
  const responses = [
    Response.json({
      data: [{
        access_token: "sensitive-short-token",
        user_id: APP_SCOPED_USER_ID,
        permissions: REQUIRED_SCOPES.join(","),
      }],
    }),
    Response.json({
      access_token: "long-token",
      token_type: "bearer",
      expires_in: 5_184_000,
    }),
  ];
  globalThis.fetch = async () => responses.shift() ?? Response.json({}, { status: 500 });
  try {
    const token = await exchangeInstagramAuthorizationCode("authorization-code");
    assert.deepEqual(token, {
      accessToken: "long-token",
      tokenType: "Bearer",
      scopes: [...REQUIRED_SCOPES].sort(),
      expiresIn: 5_184_000,
      appScopedUserId: APP_SCOPED_USER_ID,
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  globalThis.fetch = async () => Response.json({
    data: [{
      access_token: "sensitive-short-token",
      user_id: APP_SCOPED_USER_ID,
      permissions: "instagram_business_basic",
    }],
  });
  try {
    await assert.rejects(
      exchangeInstagramAuthorizationCode("authorization-code"),
      (error: unknown) => error instanceof Error
        && error.message === "SOCIAL_PROVIDER_ERROR:instagram:token_exchange:REQUIRED_SCOPE_MISSING"
        && !error.message.includes("sensitive-short-token")
        && !error.message.includes("test-client-secret"),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("token exchange preserves an unquoted unsafe Instagram user ID end to end", async () => {
  installInstagramEnvironment();
  const originalFetch = globalThis.fetch;
  const responses = [
    new Response(
      '{"data":[{"access_token":"sensitive-short-token","user_id":17841405793187218,"permissions":"instagram_business_basic,instagram_business_content_publish"}]}',
      { headers: { "content-type": "application/json" } },
    ),
    Response.json({
      access_token: "long-token",
      token_type: "bearer",
      expires_in: 5_184_000,
    }),
  ];
  globalThis.fetch = async () => responses.shift() ?? Response.json({}, { status: 500 });
  try {
    const token = await exchangeInstagramAuthorizationCode("authorization-code");
    assert.equal(token.appScopedUserId, APP_SCOPED_USER_ID);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
