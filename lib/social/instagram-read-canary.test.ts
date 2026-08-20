import assert from "node:assert/strict";
import test from "node:test";

import { runInstagramReadCanary } from "./instagram-read-canary";

const NOW = new Date("2026-08-21T02:00:00.000Z");

function connection() {
  return {
    provider: "instagram" as const,
    externalAccountId: "17841471234567890",
    username: "hooma.ge" as const,
    scopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_insights",
    ],
    accessToken: "sensitive-token",
    accessExpiresAt: "2026-10-15T00:13:24.986Z",
    tokenVersion: 1,
  };
}

test("read canary returns only sanitized read-only evidence", async () => {
  const calls: string[] = [];
  const result = await runInstagramReadCanary({
    now: NOW,
    connection: connection(),
    client: {
      connectionStatus: () => ({
        provider: "INSTAGRAM_API_WITH_INSTAGRAM_LOGIN",
        schemaFrozen: true,
        networkEnabled: true,
        expectedUsername: "hooma.ge",
        mutationsImplemented: false,
      }),
      fetchContentPublishingLimit: async (input, token) => {
        calls.push(`quota:${input.accountId}:${token}`);
        return {
          status: "AVAILABLE",
          usage: 3,
          total: 25,
          remaining: 22,
          durationSeconds: 86_400,
        };
      },
      lookupOwnedReelDuplicate: async (input, token) => {
        calls.push(`duplicate:${input.accountId}:${input.maxPages}:${token}`);
        assert.equal(input.notBefore, "2026-08-14T02:00:00.000Z");
        assert.match(input.captionSha256, /^[a-f0-9]{64}$/);
        return { status: "CLEAR", scannedCount: 9 };
      },
    },
  });

  assert.equal(result.status, "PASS");
  assert.equal(result.sideEffects, false);
  assert.equal(result.quota.remaining, 22);
  assert.deepEqual(result.duplicateCheck, { status: "CLEAR", scannedCount: 9 });
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /17841471234567890/);
  assert.doesNotMatch(serialized, /sensitive-token/);
  assert.deepEqual(calls, [
    "quota:17841471234567890:sensitive-token",
    "duplicate:17841471234567890:1:sensitive-token",
  ]);
});

test("read canary rejects an unsafe or mutation-capable client before network calls", async () => {
  let calls = 0;
  await assert.rejects(
    runInstagramReadCanary({
      now: NOW,
      connection: connection(),
      client: {
        connectionStatus: () => ({
          provider: "INSTAGRAM_API_WITH_INSTAGRAM_LOGIN",
          schemaFrozen: true,
          networkEnabled: true,
          expectedUsername: "hooma.ge",
          mutationsImplemented: true,
        }),
        fetchContentPublishingLimit: async () => {
          calls += 1;
          throw new Error("UNREACHABLE");
        },
        lookupOwnedReelDuplicate: async () => {
          calls += 1;
          throw new Error("UNREACHABLE");
        },
      },
    }),
    /INSTAGRAM_CANARY_CONFIGURATION_INVALID/,
  );
  assert.equal(calls, 0);
});
