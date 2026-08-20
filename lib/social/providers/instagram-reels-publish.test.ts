import assert from "node:assert/strict";
import test from "node:test";

import {
  INSTAGRAM_REELS_PUBLISH_SCHEMA_ID,
  InstagramReelsPublishClient,
  InstagramReelsPublishError,
  type InstagramPublishTransport,
} from "./instagram-reels-publish";

const sha = (value: string) => value.repeat(64).slice(0, 64);
const accountId = "17841405793187218";
const activation = {
  schemaId: INSTAGRAM_REELS_PUBLISH_SCHEMA_ID,
  apiVersion: "v25.0",
  endpointSchemaReceiptSha256: sha("a"),
  connectionReceiptSha256: sha("b"),
  identityReceiptSha256: sha("c"),
  oauthScopeReceiptSha256: sha("d"),
  stagingReceiptSha256: sha("e"),
  canaryReceiptSha256: sha("f"),
  expectedAccountId: accountId,
  expectedUsername: "hooma.ge",
  shareToFeed: true,
  shareToFacebook: false,
};

function enable() {
  process.env.HOOMA_SOCIAL_PUBLISHING_ENABLED = "1";
  process.env.HOOMA_INSTAGRAM_PUBLISHING_ENABLED = "1";
  process.env.HOOMA_INSTAGRAM_API_NETWORK_ENABLED = "1";
}

test("publishing requires activation, caller opt-ins and all environment gates", async () => {
  process.env.HOOMA_SOCIAL_PUBLISHING_ENABLED = "0";
  process.env.HOOMA_INSTAGRAM_PUBLISHING_ENABLED = "1";
  process.env.HOOMA_INSTAGRAM_API_NETWORK_ENABLED = "1";
  const client = new InstagramReelsPublishClient({
    activation,
    networkEnabled: true,
    publishingEnabled: true,
    transport: async () => {
      throw new Error("network must not run");
    },
  });
  await assert.rejects(
    client.createReelContainer({
      accountId,
      videoUrl: "https://media.hooma.ge/video.mp4",
      caption: "ტესტი",
      accessToken: "token-token-token-token",
    }),
    (error: unknown) => error instanceof InstagramReelsPublishError
      && error.code === "PUBLISHING_DISABLED",
  );
});

test("container request is exact, redirect-safe and hashes only a redacted token", async () => {
  enable();
  const requests: Parameters<InstagramPublishTransport>[0][] = [];
  const client = new InstagramReelsPublishClient({
    activation,
    networkEnabled: true,
    publishingEnabled: true,
    transport: async (request) => {
      requests.push(request);
      return { status: 200, body: { id: "18000000000000001" } };
    },
  });
  const result = await client.createReelContainer({
    accountId,
    videoUrl: "https://media.hooma.ge/video.mp4?sig=safe",
    caption: "სატესტო ვიდეო",
    accessToken: "provider-access-token-secret",
  });
  assert.equal(result.containerId, "18000000000000001");
  assert.match(result.requestSha256, /^[a-f0-9]{64}$/);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url.toString(), `https://graph.instagram.com/v25.0/${accountId}/media`);
  assert.deepEqual([...requests[0].body.keys()].sort(), [
    "access_token",
    "caption",
    "media_type",
    "share_to_feed",
    "video_url",
  ]);
  assert.equal(requests[0].body.get("media_type"), "REELS");
  assert.equal(requests[0].body.get("share_to_feed"), "true");
  assert.ok(!JSON.stringify(result).includes("provider-access-token-secret"));
});

test("media publish accepts only the expected account and exact IDs", async () => {
  enable();
  const client = new InstagramReelsPublishClient({
    activation,
    networkEnabled: true,
    publishingEnabled: true,
    transport: async () => ({ status: 200, body: { id: "18000000000000002" } }),
  });
  await assert.rejects(
    client.publishReel({
      accountId: "17841405793187219",
      containerId: "18000000000000001",
      accessToken: "provider-access-token-secret",
    }),
    (error: unknown) => error instanceof InstagramReelsPublishError
      && error.code === "ACCOUNT_IDENTITY_MISMATCH",
  );
  const result = await client.publishReel({
    accountId,
    containerId: "18000000000000001",
    accessToken: "provider-access-token-secret",
  });
  assert.equal(result.mediaId, "18000000000000002");
});

test("provider errors retain only safe code and request ID", async () => {
  enable();
  const client = new InstagramReelsPublishClient({
    activation,
    networkEnabled: true,
    publishingEnabled: true,
    transport: async () => ({
      status: 400,
      body: {
        error: {
          code: 100,
          message: "provider body secret must not survive",
          fbtrace_id: "trace-safe-1",
        },
      },
    }),
  });
  await assert.rejects(
    client.publishReel({
      accountId,
      containerId: "18000000000000001",
      accessToken: "provider-access-token-secret",
    }),
    (error: unknown) => {
      assert.ok(error instanceof InstagramReelsPublishError);
      assert.equal(error.code, "META_100");
      assert.equal(error.requestId, "trace-safe-1");
      assert.ok(!error.message.includes("secret"));
      return true;
    },
  );
});
