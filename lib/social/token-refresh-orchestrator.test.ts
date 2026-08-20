import assert from "node:assert/strict";
import test from "node:test";

import type { SocialProvider } from "./config";
import {
  enabledSocialRefreshProviders,
  runSocialTokenRefreshes,
} from "./token-refresh-orchestrator";

type TestClaim = {
  provider: SocialProvider;
  id: string;
};

function code(error: unknown) {
  return error instanceof Error ? error.message : "UNKNOWN";
}

test("TikTok token maintenance is independent from the publishing gate", () => {
  assert.deepEqual(enabledSocialRefreshProviders({
    instagramOAuthEnabled: false,
    tiktokOAuthEnabled: true,
  }), ["tiktok"]);
  assert.deepEqual(enabledSocialRefreshProviders({
    instagramOAuthEnabled: true,
    tiktokOAuthEnabled: false,
  }), ["instagram"]);
  assert.deepEqual(enabledSocialRefreshProviders({
    instagramOAuthEnabled: true,
    tiktokOAuthEnabled: true,
  }), ["instagram", "tiktok"]);
  assert.deepEqual(enabledSocialRefreshProviders({
    instagramOAuthEnabled: false,
    tiktokOAuthEnabled: false,
  }), []);
});

test("refresh orchestration claims and completes each enabled provider", async () => {
  const queues: Record<SocialProvider, TestClaim[]> = {
    instagram: [{ provider: "instagram", id: "ig-1" }],
    tiktok: [{ provider: "tiktok", id: "tt-1" }],
  };
  const refreshed: string[] = [];
  const markedFailed: string[] = [];
  const result = await runSocialTokenRefreshes({
    providers: ["instagram", "tiktok"],
    maxPerProvider: 3,
    claim: async (provider) => queues[provider].shift() ?? null,
    refresh: async (claim) => {
      refreshed.push(claim.id);
    },
    markFailed: async (claim) => {
      markedFailed.push(claim.id);
    },
    errorCode: code,
  });

  assert.deepEqual(result, { refreshed: 2, failed: 0, failures: [] });
  assert.deepEqual(refreshed, ["ig-1", "tt-1"]);
  assert.deepEqual(markedFailed, []);
});

test("a failed provider is marked and does not block the other provider", async () => {
  const queues: Record<SocialProvider, TestClaim[]> = {
    instagram: [{ provider: "instagram", id: "ig-1" }],
    tiktok: [{ provider: "tiktok", id: "tt-1" }],
  };
  const refreshed: string[] = [];
  const markedFailed: string[] = [];
  const result = await runSocialTokenRefreshes({
    providers: ["instagram", "tiktok"],
    maxPerProvider: 1,
    claim: async (provider) => queues[provider].shift() ?? null,
    refresh: async (claim) => {
      if (claim.provider === "instagram") throw new Error("INSTAGRAM_REFRESH_FAILED");
      refreshed.push(claim.id);
    },
    markFailed: async (claim) => {
      markedFailed.push(claim.id);
    },
    errorCode: code,
  });

  assert.deepEqual(result, {
    refreshed: 1,
    failed: 1,
    failures: ["instagram:INSTAGRAM_REFRESH_FAILED"],
  });
  assert.deepEqual(markedFailed, ["ig-1"]);
  assert.deepEqual(refreshed, ["tt-1"]);
});

test("claim failures and provider mismatches fail closed without cross-claiming", async () => {
  const claimedProviders: SocialProvider[] = [];
  const markedFailed: string[] = [];
  const result = await runSocialTokenRefreshes({
    providers: ["instagram", "tiktok"],
    maxPerProvider: 2,
    claim: async (provider) => {
      claimedProviders.push(provider);
      if (provider === "instagram") throw new Error("CLAIM_STORE_UNAVAILABLE");
      return { provider: "instagram", id: "wrong-provider" } satisfies TestClaim;
    },
    refresh: async () => {
      throw new Error("REFRESH_MUST_NOT_RUN");
    },
    markFailed: async (claim) => {
      markedFailed.push(claim.id);
    },
    errorCode: code,
  });

  assert.deepEqual(result, {
    refreshed: 0,
    failed: 2,
    failures: [
      "instagram:CLAIM_STORE_UNAVAILABLE",
      "tiktok:SOCIAL_REFRESH_CLAIM_PROVIDER_MISMATCH",
    ],
  });
  assert.deepEqual(claimedProviders, ["instagram", "tiktok"]);
  assert.deepEqual(markedFailed, ["wrong-provider"]);
});

test("invalid refresh plans are rejected", async () => {
  await assert.rejects(runSocialTokenRefreshes({
    providers: ["tiktok", "tiktok"],
    maxPerProvider: 0,
    claim: async () => null,
    refresh: async () => undefined,
    markFailed: async () => undefined,
    errorCode: code,
  }), /SOCIAL_REFRESH_PLAN_INVALID/);
});
