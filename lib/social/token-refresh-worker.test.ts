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
