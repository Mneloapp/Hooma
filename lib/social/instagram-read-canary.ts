import "server-only";

import { createHash } from "node:crypto";

import type { InstagramPublishingConnection } from "./connections";

type ReadCanaryClient = {
  connectionStatus(): {
    provider: string;
    schemaFrozen: boolean;
    networkEnabled: boolean;
    expectedUsername: string | null;
    mutationsImplemented: boolean;
  };
  fetchContentPublishingLimit(
    input: { accountId: string },
    accessToken: string,
  ): Promise<{
    status: "AVAILABLE" | "EXHAUSTED";
    usage: number;
    total: number;
    remaining: number;
    durationSeconds: number;
  }>;
  lookupOwnedReelDuplicate(
    input: {
      accountId: string;
      captionSha256: string;
      notBefore: string;
      maxPages: number;
    },
    accessToken: string,
  ): Promise<{
    status: "DUPLICATE" | "CLEAR" | "INCONCLUSIVE_PAGE_LIMIT";
    scannedCount: number;
  }>;
};

const CANARY_CAPTION_SHA256 = createHash("sha256")
  .update("hooma-instagram-read-only-canary-v1", "utf8")
  .digest("hex");

export async function runInstagramReadCanary(input: {
  connection: InstagramPublishingConnection;
  client: ReadCanaryClient;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const status = input.client.connectionStatus();
  if (
    status.provider !== "INSTAGRAM_API_WITH_INSTAGRAM_LOGIN"
    || !status.schemaFrozen
    || !status.networkEnabled
    || status.expectedUsername !== "hooma.ge"
    || status.mutationsImplemented
    || input.connection.username !== "hooma.ge"
    || Date.parse(input.connection.accessExpiresAt) <= now.getTime() + 10 * 60 * 1_000
  ) {
    throw new Error("INSTAGRAM_CANARY_CONFIGURATION_INVALID");
  }

  const quota = await input.client.fetchContentPublishingLimit(
    { accountId: input.connection.externalAccountId },
    input.connection.accessToken,
  );
  const duplicate = await input.client.lookupOwnedReelDuplicate(
    {
      accountId: input.connection.externalAccountId,
      captionSha256: CANARY_CAPTION_SHA256,
      notBefore: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000).toISOString(),
      maxPages: 1,
    },
    input.connection.accessToken,
  );

  return {
    status: "PASS" as const,
    checkedAt: now.toISOString(),
    provider: "instagram" as const,
    schemaFrozen: true,
    accountBound: true,
    tokenExpiresAfterTenMinutes: true,
    quota,
    duplicateCheck: {
      status: duplicate.status,
      scannedCount: duplicate.scannedCount,
    },
    sideEffects: false as const,
  };
}
