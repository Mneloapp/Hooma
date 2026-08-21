import {
  INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS,
  type InstagramNineDayCampaignItem,
} from "./instagram-nine-day-2026-08-22";

export const TIKTOK_NINE_DAY_CAMPAIGN_ID =
  "tiktok-nine-day-2026-08-22" as const;

export type TikTokNineDayCampaignItem = Omit<
  InstagramNineDayCampaignItem,
  "postId"
> & {
  postId: string;
  sourceInstagramPostId: string;
};

function tiktokPostId(instagramPostId: string) {
  const value = instagramPostId.replace("-IG-", "-TT-");
  if (value === instagramPostId) throw new Error("TIKTOK_POST_ID_MAPPING_INVALID");
  return value;
}

// The exact, licensed binary masters are intentionally shared with the
// Instagram campaign. TikTok receives brand-new post/idempotency identities;
// no deleted or historical TikTok post is reused.
export const TIKTOK_NINE_DAY_CAMPAIGN_ITEMS =
  INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.map((source): TikTokNineDayCampaignItem => ({
    ...source,
    postId: tiktokPostId(source.postId),
    sourceInstagramPostId: source.postId,
  }));

export function tiktokNineDayCampaignItem(postId: unknown) {
  return typeof postId === "string"
    ? TIKTOK_NINE_DAY_CAMPAIGN_ITEMS.find((entry) => entry.postId === postId) ?? null
    : null;
}

export function tiktokNineDayMusicReceipt(item: TikTokNineDayCampaignItem) {
  return {
    schemaVersion: 1,
    receiptType: "HOOMA_LICENSED_MUSIC_MASTER_PROVENANCE",
    immutable: true,
    context: {
      platform: "tiktok",
      account: "@hooma.ge",
      postId: item.postId,
      campaignId: TIKTOK_NINE_DAY_CAMPAIGN_ID,
    },
    track: {
      id: "hooma-original-playful-discovery-v1",
      commercialUseAllowed: true,
      trackSha256: "6f3490de73ceb508ebb5a4f5a778933c18ae03e846472e1d362acf0d7336bf57",
      license: {
        status: "VERIFIED",
        commercialUseAllowed: true,
        platforms: ["tiktok"],
        receiptSha256: "06f7dd4e89a75d101b5dc0af270f86580e5f9bba135d3a72213c29e6533ca5f5",
      },
    },
    output: {
      sha256: item.videoSha256,
      audioPcmSha256: item.audioPcmSha256,
    },
    sourceReceipt: {
      receiptType: "HOOMA_LICENSED_VOICE_MUSIC_MASTER_PROVENANCE",
      receiptSha256: item.sourceReceiptSha256,
      provenanceSha256: item.provenanceSha256,
      sourceVoiceSha256: item.sourceVoiceSha256,
    },
  } as const;
}

export function tiktokNineDaySettings(item: TikTokNineDayCampaignItem) {
  return {
    schema: "hooma-tiktok-nine-day-campaign-v1",
    campaignId: TIKTOK_NINE_DAY_CAMPAIGN_ID,
    commentsEnabled: true,
    duetEnabled: false,
    stitchEnabled: false,
    aiGeneratedContent: true,
    commercialContent: true,
    promotionType: "YOUR_BRAND",
    uploadToDraft: false,
    adsOnly: false,
    shareToFacebook: false,
    ownerRightsAttestation: {
      status: "CONFIRMED",
      owner: "Giorgi",
      confirmedOn: "2026-08-21",
      scope: "USE_AND_UPLOAD_ALL_NINE_EXACT_CAMPAIGN_MASTERS_TO_TIKTOK_AND_INSTAGRAM",
    },
    exactCreativeApproval: {
      status: "APPROVED_EXACT",
      owner: "Giorgi",
      confirmedOn: "2026-08-21",
    },
    technicalQa: {
      status: "PASS",
      durationSeconds: 11.7,
      width: 1080,
      height: 1920,
      videoCodec: "h264",
      cfrFps: 30,
      pixelFormat: "yuv420p",
      integratedLufs: item.integratedLufs,
      truePeakDbtp: item.truePeakDbtp,
    },
    analytics: { snapshotsHours: [2, 24, 72], unavailableMetrics: "NULL" },
    approvedPublishWindow: {
      scheduledAt: item.scheduledAt,
      publishNotAfter: item.publishNotAfter,
      timezone: "Asia/Tbilisi",
    },
  } as const;
}
