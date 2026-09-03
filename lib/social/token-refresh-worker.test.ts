import assert from "node:assert/strict";
import test from "node:test";

import type {
  NewSocialConnection,
  SocialConnectionRefreshClaim,
} from "./connections";
import {
  refreshClaimedSocialConnection,
  type SocialTokenRefreshDependencies,
} from "./token-refresh-worker";

function tiktokClaim() {
  return {
    provider: "tiktok",
    externalAccountId: "account-open-id",
    username: "hooma.ge",
    scopes: ["approved.account.read", "approved.content.publish"],
    accessTokenEnvelope: {} as SocialConnectionRefreshClaim["accessTokenEnvelope"],
    refreshTokenEnvelope: {} as NonNullable<SocialConnectionRefreshClaim["refreshTokenEnvelope"]>,
    tokenVersion: 4,
    refreshLeaseId: "00000000-0000-4000-8000-000000000001",
  } satisfies SocialConnectionRefreshClaim;
}

function instagramClaim() {
  return {
    provider: "instagram",
    externalAccountId: "17941405793187219",
    username: "hooma.ge",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    accessTokenEnvelope: {} as SocialConnectionRefreshClaim["accessTokenEnvelope"],
    refreshTokenEnvelope: null,
    tokenVersion: 2,
    refreshLeaseId: "00000000-0000-4000-8000-000000000002",
  } satisfies SocialConnectionRefreshClaim;
}

function youtubeClaim() {
  return {
    provider: "youtube",
    externalAccountId: "UCDv_CqLgtUlMUfFg7VAs4aQ",
    username: "hoomastore",
    scopes: [
      "https://www.googleapis.com/auth/youtube.readonly",
      "https://www.googleapis.com/auth/youtube.upload",
    ],
    accessTokenEnvelope: {} as SocialConnectionRefreshClaim["accessTokenEnvelope"],
    refreshTokenEnvelope: {} as NonNullable<SocialConnectionRefreshClaim["refreshTokenEnvelope"]>,
    tokenVersion: 3,
    refreshLeaseId: "00000000-0000-4000-8000-000000000003",
  } satisfies SocialConnectionRefreshClaim;
}

test("Instagram refresh verifies the professional account ID and preserves both ID namespaces", async () => {
  const claim = instagramClaim();
  const completed: NewSocialConnection[] = [];
  const dependencies: SocialTokenRefreshDependencies = {
    decrypt: (claimed, kind) => {
      assert.equal(claimed, claim);
      assert.equal(kind, "access");
      return "previous-access-token";
    },
    refreshInstagram: async (accessToken) => {
      assert.equal(accessToken, "previous-access-token");
      return { accessToken: "refreshed-access-token", expiresIn: 5_184_000 };
    },
    getInstagramIdentity: async (accessToken, expected) => {
      assert.equal(accessToken, "refreshed-access-token");
      assert.deepEqual(expected, { accountId: claim.externalAccountId });
      return {
        accountId: claim.externalAccountId,
        appScopedUserId: "17841405793187218",
        username: "hooma.ge",
        accountType: "Business",
      };
    },
    refreshTikTok: async () => {
      throw new Error("TIKTOK_REFRESH_MUST_NOT_RUN");
    },
    getTikTokIdentity: async () => {
      throw new Error("TIKTOK_IDENTITY_MUST_NOT_RUN");
    },
    complete: async (completedClaim, input) => {
      assert.equal(completedClaim, claim);
      completed.push(input);
    },
  };

  await refreshClaimedSocialConnection(claim, dependencies);

  assert.deepEqual(completed, [{
    provider: "instagram",
    tokenType: "Bearer",
    scopes: ["instagram_business_basic", "instagram_business_content_publish"],
    accessToken: "refreshed-access-token",
    refreshToken: null,
    expiresIn: 5_184_000,
    refreshTokenExpiresIn: null,
    identity: {
      accountId: claim.externalAccountId,
      username: "hooma.ge",
      snapshot: {
        account_id: claim.externalAccountId,
        app_scoped_user_id: "17841405793187218",
        username: "hooma.ge",
        account_type: "Business",
      },
    },
  }]);
});

test("TikTok refresh worker persists the returned rotated refresh token", async () => {
  const claim = tiktokClaim();
  const completed: NewSocialConnection[] = [];
  const observedDecryptKinds: Array<"access" | "refresh"> = [];
  const dependencies: SocialTokenRefreshDependencies = {
    decrypt: (_claim, kind) => {
      observedDecryptKinds.push(kind);
      return "previous-refresh-token";
    },
    refreshInstagram: async () => {
      throw new Error("INSTAGRAM_REFRESH_MUST_NOT_RUN");
    },
    getInstagramIdentity: async () => {
      throw new Error("INSTAGRAM_IDENTITY_MUST_NOT_RUN");
    },
    refreshTikTok: async (refreshToken, expectedOpenId) => {
      assert.equal(refreshToken, "previous-refresh-token");
      assert.equal(expectedOpenId, "account-open-id");
      return {
        accessToken: "rotated-access-token",
        refreshToken: "rotated-refresh-token",
        tokenType: "Bearer",
        scopes: ["approved.account.read", "approved.content.publish"],
        expiresIn: 86_400,
        refreshTokenExpiresIn: 31_536_000,
        openId: "account-open-id",
      };
    },
    getTikTokIdentity: async (accessToken, expectedAccountId) => {
      assert.equal(accessToken, "rotated-access-token");
      assert.equal(expectedAccountId, "account-open-id");
      return {
        accountId: "account-open-id",
        username: "hooma.ge",
        displayName: "Hooma",
      };
    },
    complete: async (completedClaim, input) => {
      assert.equal(completedClaim, claim);
      completed.push(input);
    },
  };

  await refreshClaimedSocialConnection(claim, dependencies);

  assert.deepEqual(observedDecryptKinds, ["refresh"]);
  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0], {
    provider: "tiktok",
    tokenType: "Bearer",
    scopes: ["approved.account.read", "approved.content.publish"],
    accessToken: "rotated-access-token",
    refreshToken: "rotated-refresh-token",
    expiresIn: 86_400,
    refreshTokenExpiresIn: 31_536_000,
    identity: {
      accountId: "account-open-id",
      username: "hooma.ge",
      snapshot: {
        business_id: "account-open-id",
        username: "hooma.ge",
        display_name: "Hooma",
      },
    },
  });
});

test("YouTube refresh keeps the offline grant and re-verifies the exact Hooma channel", async () => {
  const claim = youtubeClaim();
  const completed: NewSocialConnection[] = [];
  const dependencies: SocialTokenRefreshDependencies = {
    decrypt: (claimed, kind) => {
      assert.equal(claimed, claim);
      assert.equal(kind, "refresh");
      return "stored-google-refresh-token";
    },
    refreshInstagram: async () => {
      throw new Error("INSTAGRAM_REFRESH_MUST_NOT_RUN");
    },
    getInstagramIdentity: async () => {
      throw new Error("INSTAGRAM_IDENTITY_MUST_NOT_RUN");
    },
    refreshTikTok: async () => {
      throw new Error("TIKTOK_REFRESH_MUST_NOT_RUN");
    },
    getTikTokIdentity: async () => {
      throw new Error("TIKTOK_IDENTITY_MUST_NOT_RUN");
    },
    refreshYouTube: async (refreshToken) => {
      assert.equal(refreshToken, "stored-google-refresh-token");
      return {
        accessToken: "new-google-access-token",
        refreshToken: null,
        tokenType: "Bearer",
        scopes: claim.scopes,
        expiresIn: 3_600,
      };
    },
    getYouTubeIdentity: async (accessToken) => {
      assert.equal(accessToken, "new-google-access-token");
      return {
        accountId: claim.externalAccountId,
        username: "hoomastore",
        title: "Hooma",
        channelUrl: "https://www.youtube.com/@Hoomastore",
      };
    },
    complete: async (completedClaim, input) => {
      assert.equal(completedClaim, claim);
      completed.push(input);
    },
  };

  await refreshClaimedSocialConnection(claim, dependencies);

  assert.equal(completed.length, 1);
  assert.equal(completed[0]?.provider, "youtube");
  assert.equal(completed[0]?.refreshToken, null);
  assert.deepEqual(completed[0]?.scopes, claim.scopes);
  assert.equal(completed[0]?.identity.accountId, claim.externalAccountId);
  assert.equal(completed[0]?.identity.username, "hoomastore");
});
