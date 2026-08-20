import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  InstagramReelsReadClient,
  type InstagramReadTransportRequest,
  type InstagramReelsReadActivation,
  INSTAGRAM_REELS_READ_SCHEMA_ID,
  parseInstagramReadJson,
} from "./instagram-reels-read";

const ACCOUNT_ID = "17841471234567890";
const MEDIA_ID = "17999999999999999";
const CONTAINER_ID = "18000000000000001";
const TOKEN = "sensitive-access-token";

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function activation(
  overrides: Partial<InstagramReelsReadActivation> = {},
): InstagramReelsReadActivation {
  return {
    schemaId: INSTAGRAM_REELS_READ_SCHEMA_ID,
    apiVersion: "v25.0",
    endpointSchemaReceiptSha256: hash("endpoint-schema"),
    connectionReceiptSha256: hash("connection"),
    identityReceiptSha256: hash("identity"),
    oauthScopeReceiptSha256: hash("oauth-scopes"),
    expectedAccountId: ACCOUNT_ID,
    expectedUsername: "hooma.ge",
    grantedScopes: [
      "instagram_business_basic",
      "instagram_business_content_publish",
      "instagram_business_manage_insights",
    ],
    ...overrides,
  };
}

function enableReads() {
  process.env.HOOMA_INSTAGRAM_API_NETWORK_ENABLED = "1";
}

function enableInsights() {
  enableReads();
  process.env.HOOMA_INSTAGRAM_INSIGHTS_ENABLED = "1";
}

function clearFlags() {
  delete process.env.HOOMA_INSTAGRAM_API_NETWORK_ENABLED;
  delete process.env.HOOMA_INSTAGRAM_INSIGHTS_ENABLED;
}

test("activation and network access remain disabled by default", async () => {
  clearFlags();
  let calls = 0;
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    insightsEnabled: true,
    transport: async () => {
      calls += 1;
      return { status: 200, body: {} };
    },
  });
  assert.deepEqual(client.connectionStatus(), {
    provider: "INSTAGRAM_API_WITH_INSTAGRAM_LOGIN",
    schemaId: INSTAGRAM_REELS_READ_SCHEMA_ID,
    schemaFrozen: true,
    networkEnabled: false,
    insightsEnabled: false,
    expectedAccountId: ACCOUNT_ID,
    expectedUsername: "hooma.ge",
    credentialsLoaded: false,
    mutationsImplemented: false,
  });
  await assert.rejects(
    client.fetchContentPublishingLimit({ accountId: ACCOUNT_ID }, TOKEN),
    /INSTAGRAM_REELS_READ_ERROR:publishing_limit:NETWORK_DISABLED/,
  );
  assert.equal(calls, 0);
});

test("invalid activation evidence blocks transport", async () => {
  enableReads();
  let calls = 0;
  const client = new InstagramReelsReadClient({
    activation: activation({ grantedScopes: ["instagram_business_basic"] }),
    networkEnabled: true,
    transport: async () => {
      calls += 1;
      return { status: 200, body: {} };
    },
  });
  try {
    await assert.rejects(
      client.fetchContentPublishingLimit({ accountId: ACCOUNT_ID }, TOKEN),
      /INSTAGRAM_REELS_READ_ERROR:publishing_limit:ACTIVATION_RECEIPTS_REQUIRED/,
    );
  } finally {
    clearFlags();
  }
  assert.equal(calls, 0);
});

test("lossless parser preserves repeated large numeric Meta IDs", () => {
  const body = parseInstagramReadJson(
    '{"data":[{"id":178414712345678901},{"id":179999999999999999}]}',
  ) as { data: Array<{ id: string }> };
  assert.equal(body.data[0]?.id, "178414712345678901");
  assert.equal(body.data[1]?.id, "179999999999999999");
});

test("publishing limit is read with bearer auth and no token in URL", async () => {
  enableReads();
  const observed: InstagramReadTransportRequest[] = [];
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    transport: async (request) => {
      observed.push(request);
      return {
        status: 200,
        body: {
          data: [{
            quota_usage: 0,
            config: { quota_total: 100, quota_duration: 86_400 },
          }],
        },
      };
    },
  });
  try {
    const limit = await client.fetchContentPublishingLimit(
      { accountId: ACCOUNT_ID },
      TOKEN,
    );
    assert.deepEqual(limit, {
      status: "AVAILABLE",
      usage: 0,
      total: 100,
      remaining: 100,
      durationSeconds: 86_400,
    });
  } finally {
    clearFlags();
  }
  assert.equal(observed.length, 1);
  assert.equal(observed[0]?.method, "GET");
  assert.equal(observed[0]?.url.origin, "https://graph.instagram.com");
  assert.equal(
    observed[0]?.url.pathname,
    `/v25.0/${ACCOUNT_ID}/content_publishing_limit`,
  );
  assert.equal(observed[0]?.url.searchParams.get("fields"), "quota_usage,config");
  assert.equal(observed[0]?.url.toString().includes(TOKEN), false);
  assert.equal(observed[0]?.headers.Authorization, `Bearer ${TOKEN}`);
});

test("owned-media lookup returns an exact-caption Reel duplicate without leaking captions", async () => {
  enableReads();
  const caption = "ყველას დააბალანსებდი? 🧩";
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    transport: async () => ({
      status: 200,
      body: {
        data: [{
          id: MEDIA_ID,
          caption,
          media_type: "VIDEO",
          media_product_type: "REELS",
          permalink: "https://www.instagram.com/reel/ABC_123/",
          timestamp: "2026-08-15T20:30:00+0000",
        }],
      },
    }),
  });
  try {
    const result = await client.lookupOwnedReelDuplicate({
      accountId: ACCOUNT_ID,
      captionSha256: hash(caption),
      notBefore: "2026-08-15T18:00:00.000Z",
    }, TOKEN);
    assert.deepEqual(result, {
      status: "DUPLICATE",
      scannedCount: 1,
      duplicate: {
        mediaId: MEDIA_ID,
        permalink: "https://www.instagram.com/reel/ABC_123/",
        timestamp: "2026-08-15T20:30:00.000Z",
      },
    });
    assert.equal(JSON.stringify(result).includes(caption), false);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  } finally {
    clearFlags();
  }
});

test("owned-media lookup never reports clear when the page cap is reached", async () => {
  enableReads();
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    transport: async () => ({
      status: 200,
      body: {
        data: [{
          id: MEDIA_ID,
          caption: "different caption",
          media_type: "VIDEO",
          media_product_type: "REELS",
          permalink: "https://www.instagram.com/reel/ABC_123/",
          timestamp: "2026-08-15T20:30:00+0000",
        }],
        paging: { cursors: { after: "opaque-next-cursor" } },
      },
    }),
  });
  try {
    const result = await client.lookupOwnedReelDuplicate({
      accountId: ACCOUNT_ID,
      captionSha256: hash("expected caption"),
      notBefore: "2026-08-15T18:00:00.000Z",
      maxPages: 1,
    }, TOKEN);
    assert.equal(result.status, "INCONCLUSIVE_PAGE_LIMIT");
    assert.equal(result.scannedCount, 1);
  } finally {
    clearFlags();
  }
});

test("owned-media lookup treats empty or null captions as safely non-matching", async () => {
  for (const caption of ["", null]) {
    enableReads();
    const client = new InstagramReelsReadClient({
      activation: activation(),
      networkEnabled: true,
      transport: async () => ({
        status: 200,
        body: {
          data: [{
            id: MEDIA_ID,
            caption,
            media_type: "VIDEO",
            media_product_type: "REELS",
            permalink: "https://www.instagram.com/reel/ABC_123/",
            timestamp: "2026-08-15T20:30:00+0000",
          }],
        },
      }),
    });
    try {
      const result = await client.lookupOwnedReelDuplicate({
        accountId: ACCOUNT_ID,
        captionSha256: hash("expected caption"),
        notBefore: "2026-08-15T18:00:00.000Z",
        maxPages: 1,
      }, TOKEN);
      assert.equal(result.status, "CLEAR");
      assert.equal(result.scannedCount, 1);
    } finally {
      clearFlags();
    }
  }
});

test("owned-media schema failures identify only the invalid field class", async () => {
  enableReads();
  const cases = [
    [{ unexpected: [] }, "INVALID_MEDIA_LIST_ENVELOPE"],
    [{ data: [{ id: MEDIA_ID }] }, "INVALID_MEDIA_ITEM_KEYS"],
    [{ data: [{ id: MEDIA_ID, caption: "x", media_type: "AUDIO", media_product_type: "REELS", permalink: "https://www.instagram.com/reel/ABC_123/", timestamp: "2026-08-15T20:30:00+0000" }] }, "INVALID_MEDIA_TYPE"],
    [{ data: [{ id: MEDIA_ID, caption: "x", media_type: "VIDEO", media_product_type: "UNKNOWN", permalink: "https://www.instagram.com/reel/ABC_123/", timestamp: "2026-08-15T20:30:00+0000" }] }, "INVALID_MEDIA_PRODUCT_TYPE"],
  ] as const;
  try {
    for (const [body, code] of cases) {
      const client = new InstagramReelsReadClient({
        activation: activation(),
        networkEnabled: true,
        transport: async () => ({ status: 200, body }),
      });
      await assert.rejects(
        client.lookupOwnedReelDuplicate({
          accountId: ACCOUNT_ID,
          captionSha256: hash("expected caption"),
          notBefore: "2026-08-15T18:00:00.000Z",
          maxPages: 1,
        }, TOKEN),
        new RegExp(`INSTAGRAM_REELS_READ_ERROR:owned_media:${code}`),
      );
    }
  } finally {
    clearFlags();
  }
});

test("container status accepts only reviewed values and binds the returned ID", async () => {
  enableReads();
  const statuses = ["IN_PROGRESS", "FINISHED"];
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    transport: async () => ({
      status: 200,
      body: { id: CONTAINER_ID, status_code: statuses.shift() },
    }),
  });
  try {
    assert.deepEqual(
      await client.fetchContainerStatus({ accountId: ACCOUNT_ID, containerId: CONTAINER_ID }, TOKEN),
      { containerId: CONTAINER_ID, statusCode: "IN_PROGRESS", status: "PROCESSING" },
    );
    assert.deepEqual(
      await client.fetchContainerStatus({ accountId: ACCOUNT_ID, containerId: CONTAINER_ID }, TOKEN),
      { containerId: CONTAINER_ID, statusCode: "FINISHED", status: "READY" },
    );
  } finally {
    clearFlags();
  }
});

test("unknown container statuses fail closed", async () => {
  enableReads();
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    transport: async () => ({
      status: 200,
      body: { id: CONTAINER_ID, status_code: "NEW_UNREVIEWED_STATUS" },
    }),
  });
  try {
    await assert.rejects(
      client.fetchContainerStatus({ accountId: ACCOUNT_ID, containerId: CONTAINER_ID }, TOKEN),
      /INSTAGRAM_REELS_READ_ERROR:container_status:INVALID_CONTAINER_STATUS_RESPONSE/,
    );
  } finally {
    clearFlags();
  }
});

test("media insights preserve missing values as null and real zero as zero", async () => {
  enableInsights();
  const observed: InstagramReadTransportRequest[] = [];
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    insightsEnabled: true,
    transport: async (request) => {
      observed.push(request);
      return {
        status: 200,
        body: {
          data: [
            { name: "views", period: "lifetime", values: [{ value: 138 }] },
            { name: "likes", period: "lifetime", values: [{ value: 0 }] },
            { name: "comments", period: "lifetime", values: [{ value: 3 }] },
            { name: "ig_reels_avg_watch_time", period: "lifetime", values: [{ value: 4500 }] },
          ],
        },
      };
    },
  });
  try {
    const result = await client.fetchMediaInsights(
      { accountId: ACCOUNT_ID, mediaId: MEDIA_ID },
      TOKEN,
    );
    assert.equal(result.status, "AVAILABLE");
    assert.equal(result.metrics.views, 138);
    assert.equal(result.metrics.likes, 0);
    assert.equal(result.metrics.comments, 3);
    assert.equal(result.metrics.reach, null);
    assert.equal(result.metrics.reelsAverageWatchTime, 4500);
    assert.equal(JSON.stringify(result).includes(TOKEN), false);
  } finally {
    clearFlags();
  }
  assert.equal(observed[0]?.url.pathname, `/v25.0/${MEDIA_ID}/insights`);
  assert.equal(observed[0]?.url.toString().includes(TOKEN), false);
});

test("insights need their narrower kill switch and make no transport call", async () => {
  enableReads();
  let calls = 0;
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    insightsEnabled: true,
    transport: async () => {
      calls += 1;
      return { status: 200, body: {} };
    },
  });
  try {
    await assert.rejects(
      client.fetchMediaInsights({ accountId: ACCOUNT_ID, mediaId: MEDIA_ID }, TOKEN),
      /INSTAGRAM_REELS_READ_ERROR:media_insights:INSIGHTS_DISABLED/,
    );
  } finally {
    clearFlags();
  }
  assert.equal(calls, 0);
});

test("provider errors reduce to bounded diagnostics without raw messages or tokens", async () => {
  enableReads();
  const client = new InstagramReelsReadClient({
    activation: activation(),
    networkEnabled: true,
    transport: async () => ({
      status: 400,
      body: {
        error: {
          message: `bad ${TOKEN}`,
          code: 190,
          error_subcode: 460,
          fbtrace_id: "trace-id-1",
          is_transient: false,
        },
      },
    }),
  });
  try {
    await assert.rejects(
      client.fetchContentPublishingLimit({ accountId: ACCOUNT_ID }, TOKEN),
      (error: unknown) => {
        assert.equal(
          (error as Error).message,
          "INSTAGRAM_REELS_READ_ERROR:publishing_limit:190_460",
        );
        assert.equal((error as Error).message.includes(TOKEN), false);
        return true;
      },
    );
  } finally {
    clearFlags();
  }
});
