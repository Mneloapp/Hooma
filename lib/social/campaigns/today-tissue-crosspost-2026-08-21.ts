import {
  INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS,
  instagramNineDayMusicReceipt,
  instagramNineDaySettings,
  type InstagramNineDayCampaignItem,
} from "./instagram-nine-day-2026-08-22";
import {
  TIKTOK_NINE_DAY_CAMPAIGN_ITEMS,
  tiktokNineDayMusicReceipt,
  tiktokNineDaySettings,
  type TikTokNineDayCampaignItem,
} from "./tiktok-nine-day-2026-08-22";

export const TODAY_TISSUE_CROSSPOST_CAMPAIGN_ID =
  "today-tissue-crosspost-2026-08-21" as const;

export type TodayTissueCrosspostItem =
  | (InstagramNineDayCampaignItem & {
      platform: "instagram";
      sourcePostId: string;
    })
  | (TikTokNineDayCampaignItem & {
      platform: "tiktok";
      sourcePostId: string;
    });

const instagramSource = INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS.find(
  (item) => item.postId === "P-20260830-IG-2000-TISSUE-BOX",
);
const tiktokSource = TIKTOK_NINE_DAY_CAMPAIGN_ITEMS.find(
  (item) => item.postId === "P-20260830-TT-2000-TISSUE-BOX",
);

if (!instagramSource || !tiktokSource) {
  throw new Error("TODAY_TISSUE_SOURCE_MISSING");
}

export const TODAY_TISSUE_CROSSPOST_ITEMS = [
  {
    ...instagramSource,
    platform: "instagram",
    sourcePostId: instagramSource.postId,
    postId: "P-20260821-IG-2000-TISSUE-BOX",
    scheduledAt: "2026-08-21T20:00:00+04:00",
    publishNotAfter: "2026-08-21T21:30:00+04:00",
  },
  {
    ...tiktokSource,
    platform: "tiktok",
    sourcePostId: tiktokSource.postId,
    postId: "P-20260821-TT-2000-TISSUE-BOX",
    scheduledAt: "2026-08-21T20:00:00+04:00",
    publishNotAfter: "2026-08-21T21:30:00+04:00",
  },
] as const satisfies readonly TodayTissueCrosspostItem[];

export function todayTissueCrosspostItem(postId: unknown) {
  return typeof postId === "string"
    ? TODAY_TISSUE_CROSSPOST_ITEMS.find((item) => item.postId === postId) ?? null
    : null;
}

export function todayTissueCrosspostMusicReceipt(item: TodayTissueCrosspostItem) {
  const source = item.platform === "instagram" ? instagramSource : tiktokSource;
  const base = item.platform === "instagram"
    ? instagramNineDayMusicReceipt(source as InstagramNineDayCampaignItem)
    : tiktokNineDayMusicReceipt(source as TikTokNineDayCampaignItem);
  return {
    ...base,
    context: {
      ...base.context,
      platform: item.platform,
      postId: item.postId,
      campaignId: TODAY_TISSUE_CROSSPOST_CAMPAIGN_ID,
    },
  };
}

export function todayTissueCrosspostSettings(item: TodayTissueCrosspostItem) {
  const source = item.platform === "instagram" ? instagramSource : tiktokSource;
  const base = item.platform === "instagram"
    ? instagramNineDaySettings(source as InstagramNineDayCampaignItem)
    : tiktokNineDaySettings(source as TikTokNineDayCampaignItem);
  return {
    ...base,
    schema: "hooma-today-tissue-crosspost-v1",
    campaignId: TODAY_TISSUE_CROSSPOST_CAMPAIGN_ID,
    ownerRightsAttestation: {
      status: "CONFIRMED",
      owner: "Giorgi",
      confirmedOn: "2026-08-21",
      scope: "USE_AND_UPLOAD_THIS_EXACT_TISSUE_BOX_MASTER_TO_TIKTOK_AND_INSTAGRAM",
    },
    exactCreativeApproval: {
      status: "APPROVED_EXACT",
      owner: "Giorgi",
      confirmedOn: "2026-08-21",
    },
    approvedPublishWindow: {
      scheduledAt: item.scheduledAt,
      publishNotAfter: item.publishNotAfter,
      timezone: "Asia/Tbilisi",
    },
  } as const;
}
