import assert from "node:assert/strict";
import test from "node:test";

import {
  FACEBOOK_REQUIRED_SCOPES,
  YOUTUBE_REQUIRED_SCOPES,
  providerConfig,
} from "../config";
import {
  buildFacebookAuthorizationUrl,
  exchangeFacebookAuthorizationCode,
  getFacebookPageIdentity,
} from "./facebook-oauth";
import {
  buildYouTubeAuthorizationUrl,
  exchangeYouTubeAuthorizationCode,
  getYouTubeChannelIdentity,
  refreshYouTubeAccessToken,
} from "./youtube-oauth";

const pageId = "123456789012345";
const channelId = "UCabcdefghijklmnopqrstuv";

function installEnvironment() {
  process.env.FACEBOOK_APP_ID = "facebook-app-id";
  process.env.FACEBOOK_APP_SECRET = "facebook-app-secret";
  process.env.FACEBOOK_GRAPH_API_VERSION = "v25.0";
  process.env.FACEBOOK_REDIRECT_URI = "https://hooma.ge/api/social/oauth/facebook/callback";
  process.env.FACEBOOK_EXPECTED_PAGE_ID = pageId;
  process.env.FACEBOOK_EXPECTED_PAGE_USERNAME = "@Hooma.Ge";
  process.env.YOUTUBE_CLIENT_ID = "youtube-client-id.apps.googleusercontent.com";
  process.env.YOUTUBE_CLIENT_SECRET = "youtube-client-secret";
  process.env.YOUTUBE_REDIRECT_URI = "https://hooma.ge/api/social/oauth/youtube/callback";
  process.env.YOUTUBE_EXPECTED_CHANNEL_ID = channelId;
  process.env.YOUTUBE_EXPECTED_CHANNEL_HANDLE = "@Hooma.Ge";
}

test("Facebook authorization is pinned to the exact Page scopes and callback", () => {
  installEnvironment();
  const url = buildFacebookAuthorizationUrl("safe-state");
  assert.equal(url.origin, "https://www.facebook.com");
  assert.equal(url.pathname, "/v25.0/dialog/oauth");
  assert.equal(url.searchParams.get("redirect_uri"), "https://hooma.ge/api/social/oauth/facebook/callback");
  assert.deepEqual(
    url.searchParams.get("scope")?.split(","),
    [...FACEBOOK_REQUIRED_SCOPES],
  );
  assert.equal(providerConfig("facebook").expectedAccountId, pageId);
});

test("Facebook token exchange stores only the exact Hooma Page token", async () => {
  installEnvironment();
  const originalFetch = globalThis.fetch;
  const responses = [
    { access_token: "short-user-token" },
    { access_token: "long-user-token", expires_in: 5_184_000 },
    { data: FACEBOOK_REQUIRED_SCOPES.map((permission) => ({ permission, status: "granted" })) },
    { data: [{ id: pageId, name: "Hooma", username: "hooma.ge", access_token: "page-token", tasks: ["CREATE_CONTENT"] }] },
    { id: pageId, name: "Hooma", username: "hooma.ge", link: "https://www.facebook.com/hooma.ge" },
  ];
  globalThis.fetch = async () => new Response(JSON.stringify(responses.shift()), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try {
    const token = await exchangeFacebookAuthorizationCode("authorization-code");
    assert.equal(token.accessToken, "page-token");
    assert.equal(token.expiresIn, 5_184_000);
    const identity = await getFacebookPageIdentity(token.accessToken);
    assert.equal(identity.accountId, pageId);
    assert.equal(identity.username, "hooma.ge");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("YouTube authorization requires offline consent, exact scopes and S256 PKCE", () => {
  installEnvironment();
  const challenge = "a".repeat(43);
  const url = buildYouTubeAuthorizationUrl({ state: "safe-state", codeChallenge: challenge });
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("prompt"), "consent");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.deepEqual(url.searchParams.get("scope")?.split(" "), [...YOUTUBE_REQUIRED_SCOPES]);
});

test("YouTube code exchange requires a refresh token and verifies exact channel identity", async () => {
  installEnvironment();
  const originalFetch = globalThis.fetch;
  const responses = [
    {
      access_token: "youtube-access-token",
      refresh_token: "youtube-refresh-token",
      expires_in: 3_600,
      scope: YOUTUBE_REQUIRED_SCOPES.join(" "),
      token_type: "Bearer",
    },
    { items: [{ id: channelId, snippet: { title: "Hooma", customUrl: "@hooma.ge" } }] },
    {
      access_token: "youtube-refreshed-access-token",
      expires_in: 3_600,
      scope: YOUTUBE_REQUIRED_SCOPES.join(" "),
      token_type: "Bearer",
    },
  ];
  globalThis.fetch = async () => new Response(JSON.stringify(responses.shift()), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try {
    const token = await exchangeYouTubeAuthorizationCode({
      code: "authorization-code",
      codeVerifier: "b".repeat(43),
    });
    assert.equal(token.refreshToken, "youtube-refresh-token");
    const identity = await getYouTubeChannelIdentity(token.accessToken);
    assert.equal(identity.accountId, channelId);
    assert.equal(identity.username, "hooma.ge");
    const refreshed = await refreshYouTubeAccessToken(token.refreshToken);
    assert.equal(refreshed.accessToken, "youtube-refreshed-access-token");
    assert.equal(refreshed.refreshToken, null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
