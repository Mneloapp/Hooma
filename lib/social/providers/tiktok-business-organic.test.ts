import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  TikTokBusinessOrganicClient,
  type TikTokOrganicActivation,
  type TikTokOrganicPublishInput,
  type TikTokTransportRequest,
  TIKTOK_ORGANIC_SCHEMA_ID,
  tiktokCmlSelectionFingerprint,
  validateTikTokCmlSelectionReceipt,
} from "./tiktok-business-organic";

const NOW = new Date("2026-08-15T16:00:00.000Z");
const POST_ID = "P-20260815-TT-2000-TEST";
const ACCOUNT_ID = "owned-account-id";
const REMOTE_POST_ID = "7674252169872198932";

function hash(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function activation(overrides: Partial<TikTokOrganicActivation> = {}): TikTokOrganicActivation {
  return {
    schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
    apiVersion: "v1.3",
    appReviewStatus: "APPROVED",
    appReviewReceiptSha256: hash("app-review"),
    endpointSchemaReceiptSha256: hash("schema-review"),
    identityReceiptSha256: hash("identity"),
    oauthScopeReceiptSha256: hash("oauth-scopes"),
    urlPropertyReceiptSha256: hash("url-property"),
    cmlSchemaReceiptSha256: hash("cml-schema"),
    cmlRegion: "GE",
    expectedAccountId: ACCOUNT_ID,
    expectedUsername: "hooma.ge",
    verifiedMediaHosts: ["media.hooma.ge"],
    portalPermissions: ["Account User", "Get Account Media", "Account Post Content"],
    ...overrides,
  };
}

function cmlReceipt() {
  const receipt = {
    schemaVersion: 1,
    receiptType: "TIKTOK_COMMERCIAL_MUSIC_SELECTION",
    immutable: true,
    status: "APPROVED",
    context: {
      platform: "tiktok",
      accountId: ACCOUNT_ID,
      postId: POST_ID,
    },
    track: {
      musicSoundId: "cml-track-123",
      region: "GE",
      placement: "ORGANIC",
      commercialUseAllowed: true,
      catalogEvidenceSha256: hash("catalog-evidence"),
    },
    mix: {
      musicSoundVolume: 55,
      videoOriginalSoundVolume: 0,
    },
    binding: {
      contentFingerprint: hash("content"),
      approvalFingerprint: hash("content"),
      videoSha256: hash("video"),
      captionSha256: hash("caption"),
    },
    selectedAt: "2026-08-15T15:00:00.000Z",
    validUntil: "2026-08-15T18:00:00.000Z",
    selectionFingerprint: "",
  };
  receipt.selectionFingerprint = tiktokCmlSelectionFingerprint(receipt);
  return receipt;
}

function publishInput(overrides: Partial<TikTokOrganicPublishInput> = {}): TikTokOrganicPublishInput {
  return {
    accountId: ACCOUNT_ID,
    postId: POST_ID,
    approvalStatus: "APPROVED_EXACT",
    publishingAllowed: true,
    rightsStatus: "CLEARED",
    visualClaimsStatus: "CLEARED",
    productAvailable: true,
    remoteDuplicateStatus: "CLEAR",
    remoteDuplicateReceiptSha256: hash("remote-duplicate"),
    scheduledAt: "2026-08-15T15:59:00.000Z",
    publishNotAfter: "2026-08-15T16:05:00.000Z",
    contentFingerprint: hash("content"),
    approvalFingerprint: hash("content"),
    videoSha256: hash("video"),
    caption: "caption",
    captionSha256: hash("caption"),
    idempotencyKey: "tiktok-owned-post-test-idempotency",
    musicMode: "TIKTOK_CML",
    musicReceipt: cmlReceipt(),
    settings: {
      commentsEnabled: true,
      duetEnabled: false,
      stitchEnabled: false,
      aiGeneratedContent: true,
      commercialContent: true,
      promotionType: "YOUR_BRAND",
      uploadToDraft: false,
      adsOnly: false,
      shareToFacebook: false,
      thumbnailOffsetMs: 500,
    },
    media: {
      videoUrl: "https://media.hooma.ge/social/video.mp4?signature=sensitive",
      sha256: hash("video"),
      expiresAt: "2026-08-15T16:31:00.000Z",
      signatureReferenceSha256: hash("signature-reference"),
      urlPropertyReceiptSha256: hash("url-property"),
    },
    ...overrides,
  };
}

function enableNetworkAndPublishing() {
  process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED = "1";
  process.env.HOOMA_TIKTOK_ORGANIC_PUBLISHING_ENABLED = "1";
}

function clearNetworkAndPublishing() {
  delete process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED;
  delete process.env.HOOMA_TIKTOK_ORGANIC_PUBLISHING_ENABLED;
}

test("activation remains fail-closed when any immutable approval evidence is missing", () => {
  clearNetworkAndPublishing();
  const invalid = { ...activation(), appReviewStatus: "PENDING" };
  const client = new TikTokBusinessOrganicClient({
    activation: invalid,
    networkEnabled: true,
    publishingEnabled: true,
  });
  assert.deepEqual(client.connectionStatus(), {
    provider: "TIKTOK_API_FOR_BUSINESS_ORGANIC_ACCOUNTS",
    schemaId: TIKTOK_ORGANIC_SCHEMA_ID,
    schemaFrozen: false,
    networkEnabled: false,
    publishingEnabled: false,
    expectedUsername: null,
    credentialsLoaded: false,
  });
});

test("publishing is disabled by default and makes no transport call", async () => {
  clearNetworkAndPublishing();
  let calls = 0;
  const client = new TikTokBusinessOrganicClient({
    activation: activation(),
    networkEnabled: true,
    publishingEnabled: true,
    now: () => NOW,
    transport: async () => {
      calls += 1;
      return { status: 200, body: {} };
    },
  });
  await assert.rejects(
    client.publishVideo(publishInput(), "sensitive-token"),
    /TIKTOK_ORGANIC_ERROR:publish:NETWORK_DISABLED/,
  );
  assert.equal(calls, 0);
});

test("CML receipt is hash-bound to exact account, post, media, caption, and approval", () => {
  const receipt = cmlReceipt();
  assert.equal(validateTikTokCmlSelectionReceipt(receipt, {
    accountId: ACCOUNT_ID,
    postId: POST_ID,
    contentFingerprint: hash("content"),
    approvalFingerprint: hash("content"),
    videoSha256: hash("video"),
    captionSha256: hash("caption"),
    region: "GE",
  }, NOW).track.musicSoundId, "cml-track-123");

  const tampered = structuredClone(receipt);
  tampered.mix.musicSoundVolume = 80;
  assert.throws(
    () => validateTikTokCmlSelectionReceipt(tampered, {
      accountId: ACCOUNT_ID,
      postId: POST_ID,
      contentFingerprint: hash("content"),
      approvalFingerprint: hash("content"),
      videoSha256: hash("video"),
      captionSha256: hash("caption"),
      region: "GE",
    }, NOW),
    /TIKTOK_ORGANIC_ERROR:music:CML_RECEIPT_INVALID/,
  );

  const wrongRegion = structuredClone(receipt);
  wrongRegion.track.region = "US";
  wrongRegion.selectionFingerprint = tiktokCmlSelectionFingerprint(wrongRegion);
  assert.throws(
    () => validateTikTokCmlSelectionReceipt(wrongRegion, {
      accountId: ACCOUNT_ID,
      postId: POST_ID,
      contentFingerprint: hash("content"),
      approvalFingerprint: hash("content"),
      videoSha256: hash("video"),
      captionSha256: hash("caption"),
      region: "GE",
    }, NOW),
    /TIKTOK_ORGANIC_ERROR:music:CML_RECEIPT_INVALID/,
  );
});

test("publish request includes CML, Hooma-brand, AI, comment, and no-cross-post controls", async () => {
  enableNetworkAndPublishing();
  const observed: TikTokTransportRequest[] = [];
  const client = new TikTokBusinessOrganicClient({
    activation: activation(),
    networkEnabled: true,
    publishingEnabled: true,
    now: () => NOW,
    transport: async (request) => {
      observed.push(request);
      return {
        status: 200,
        body: {
          code: 0,
          request_id: "publish-request-1",
          data: { share_id: "v_pub_url~v1.123456789" },
        },
      };
    },
  });
  try {
    const receipt = await client.publishVideo(publishInput(), "sensitive-access-token");
    assert.equal(receipt.status, "PROCESSING_REMOTE");
    assert.equal(receipt.providerPublishId, "v_pub_url~v1.123456789");
    assert.equal(receipt.providerPostId, null);
    assert.equal(JSON.stringify(receipt).includes("sensitive"), false);
  } finally {
    clearNetworkAndPublishing();
  }

  const publishRequest = observed[0]!;
  assert.equal(publishRequest.method, "POST");
  assert.equal(publishRequest.url.toString(), "https://business-api.tiktok.com/open_api/v1.3/business/video/publish/");
  assert.equal(publishRequest.headers["Access-Token"], "sensitive-access-token");
  const body = JSON.parse(String(publishRequest.body)) as Record<string, any>;
  assert.equal(body.business_id, ACCOUNT_ID);
  assert.equal(body.post_info.is_brand_organic, true);
  assert.equal(body.post_info.is_branded_content, false);
  assert.equal(body.post_info.is_ai_generated, true);
  assert.equal(body.post_info.disable_comment, false);
  assert.equal(body.post_info.upload_to_draft, false);
  assert.equal(body.post_info.is_ads_only, false);
  assert.deepEqual(body.post_info.music_sound_info, {
    music_sound_id: "cml-track-123",
    music_sound_volume: 55,
    video_original_sound_volume: 0,
  });
});

test("publish blocks stale staging URLs and invalid disclosure settings before transport", async () => {
  enableNetworkAndPublishing();
  let calls = 0;
  const client = new TikTokBusinessOrganicClient({
    activation: activation(),
    networkEnabled: true,
    publishingEnabled: true,
    now: () => NOW,
    transport: async () => {
      calls += 1;
      return { status: 200, body: {} };
    },
  });
  try {
    await assert.rejects(
      client.publishVideo(publishInput({
        media: {
          ...publishInput().media,
          expiresAt: "2026-08-15T16:05:00.000Z",
        },
      }), "sensitive-token"),
      /TIKTOK_ORGANIC_ERROR:publish:STAGING_GATE_MISMATCH/,
    );
    await assert.rejects(
      client.publishVideo(publishInput({
        settings: {
          ...publishInput().settings,
          aiGeneratedContent: false,
        } as unknown as TikTokOrganicPublishInput["settings"],
      }), "sensitive-token"),
      /TIKTOK_ORGANIC_ERROR:publish:DISCLOSURE_GATE_MISMATCH/,
    );
    await assert.rejects(
      client.publishVideo(null as unknown as TikTokOrganicPublishInput, "sensitive-token"),
      /TIKTOK_ORGANIC_ERROR:publish:POLICY_GATE_MISMATCH/,
    );
  } finally {
    clearNetworkAndPublishing();
  }
  assert.equal(calls, 0);
});

test("transport failures are reduced to redacted retryable diagnostics", async () => {
  process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED = "1";
  const client = new TikTokBusinessOrganicClient({
    activation: activation(),
    networkEnabled: true,
    now: () => NOW,
    transport: async () => {
      throw new Error("sensitive-token provider body");
    },
  });
  try {
    await assert.rejects(
      client.fetchPublishStatus({
        accountId: ACCOUNT_ID,
        publishId: "v_pub_url~v1.123456789",
      }, "sensitive-token"),
      (error: unknown) => {
        assert.equal(error instanceof Error, true);
        assert.equal((error as Error).message, "TIKTOK_ORGANIC_ERROR:publish_status:NETWORK_FAILURE");
        assert.equal((error as { retryable?: boolean }).retryable, true);
        assert.equal((error as Error).message.includes("sensitive"), false);
        return true;
      },
    );
  } finally {
    clearNetworkAndPublishing();
  }
});

test("status polling waits for post ID and then produces one canonical published URL", async () => {
  process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED = "1";
  const responses = [
    {
      status: 200,
      body: {
        code: 0,
        request_id: "status-request-1",
        data: { status: "PUBLISH_COMPLETE", post_ids: [] },
      },
    },
    {
      status: 200,
      body: {
        code: 0,
        request_id: "status-request-2",
        data: { status: "PUBLISH_COMPLETE", post_ids: [REMOTE_POST_ID] },
      },
    },
  ];
  const client = new TikTokBusinessOrganicClient({
    activation: activation(),
    networkEnabled: true,
    now: () => NOW,
    transport: async () => responses.shift()!,
  });
  try {
    const pending = await client.fetchPublishStatus({
      accountId: ACCOUNT_ID,
      publishId: "v_pub_url~v1.123456789",
    }, "sensitive-token");
    assert.equal(pending.status, "PROCESSING_REMOTE");
    assert.equal(pending.reason, "POST_ID_PENDING");

    const published = await client.fetchPublishStatus({
      accountId: ACCOUNT_ID,
      publishId: "v_pub_url~v1.123456789",
    }, "sensitive-token");
    assert.equal(published.status, "PUBLISHED");
    assert.equal(published.providerPostId, REMOTE_POST_ID);
    assert.equal(
      published.providerUrl,
      `https://www.tiktok.com/@hooma.ge/video/${REMOTE_POST_ID}`,
    );
  } finally {
    clearNetworkAndPublishing();
  }
});

test("metrics preserve unavailable as null and retain real zero values", async () => {
  process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED = "1";
  const observed: TikTokTransportRequest[] = [];
  const client = new TikTokBusinessOrganicClient({
    activation: activation(),
    networkEnabled: true,
    now: () => NOW,
    transport: async (request) => {
      observed.push(request);
      return {
        status: 200,
        body: {
          code: 0,
          request_id: "metrics-request-1",
          data: {
            videos: [{
              item_id: REMOTE_POST_ID,
              share_url: `https://www.tiktok.com/@hooma.ge/video/${REMOTE_POST_ID}`,
              video_views: 138,
              likes: 0,
              comments: 3,
              shares: 1,
              average_time_watched: 4.5,
              full_video_watched_rate: 0.02,
            }],
          },
        },
      };
    },
  });
  try {
    const result = await client.fetchOwnedPostMetrics({
      accountId: ACCOUNT_ID,
      postId: REMOTE_POST_ID,
    }, "sensitive-token");
    assert.equal(result.status, "AVAILABLE");
    assert.equal(result.metrics.views, 138);
    assert.equal(result.metrics.likes, 0);
    assert.equal(result.metrics.favorites, null);
    assert.equal(result.metrics.averageWatchTimeSeconds, 4.5);
    assert.equal(result.metrics.fullVideoWatchedRate, 0.02);
    assert.equal(JSON.stringify(result).includes("sensitive-token"), false);
  } finally {
    clearNetworkAndPublishing();
  }
  const metricsRequest = observed[0]!;
  assert.equal(metricsRequest.method, "GET");
  assert.equal(metricsRequest.url.pathname, "/open_api/v1.3/business/video/list/");
  assert.deepEqual(JSON.parse(String(metricsRequest.url.searchParams.get("filters"))), {
    video_ids: [REMOTE_POST_ID],
    ad_post_only: false,
  });
});

test("unknown provider status fails closed", async () => {
  process.env.HOOMA_TIKTOK_ORGANIC_NETWORK_ENABLED = "1";
  const client = new TikTokBusinessOrganicClient({
    activation: activation(),
    networkEnabled: true,
    now: () => NOW,
    transport: async () => ({
      status: 200,
      body: {
        code: 0,
        request_id: "status-request-unknown",
        data: { status: "NEW_UNREVIEWED_STATUS" },
      },
    }),
  });
  try {
    await assert.rejects(
      client.fetchPublishStatus({
        accountId: ACCOUNT_ID,
        publishId: "v_pub_url~v1.123456789",
      }, "sensitive-token"),
      /TIKTOK_ORGANIC_ERROR:publish_status:UNKNOWN_PUBLISH_STATUS/,
    );
  } finally {
    clearNetworkAndPublishing();
  }
});
