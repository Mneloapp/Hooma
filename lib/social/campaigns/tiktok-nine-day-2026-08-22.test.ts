import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS } from "./instagram-nine-day-2026-08-22";
import {
  TIKTOK_NINE_DAY_CAMPAIGN_ITEMS,
  tiktokNineDayMusicReceipt,
  tiktokNineDaySettings,
} from "./tiktok-nine-day-2026-08-22";

test("TikTok campaign contains the same nine exact masters under new TikTok identities", () => {
  assert.equal(TIKTOK_NINE_DAY_CAMPAIGN_ITEMS.length, 9);
  assert.equal(new Set(TIKTOK_NINE_DAY_CAMPAIGN_ITEMS.map((item) => item.postId)).size, 9);
  TIKTOK_NINE_DAY_CAMPAIGN_ITEMS.forEach((item, index) => {
    const source = INSTAGRAM_NINE_DAY_CAMPAIGN_ITEMS[index]!;
    assert.equal(item.sequence, index + 1);
    assert.equal(item.sourceInstagramPostId, source.postId);
    assert.equal(item.postId, source.postId.replace("-IG-", "-TT-"));
    assert.notEqual(item.postId, source.postId);
    assert.equal(item.videoSha256, source.videoSha256);
    assert.equal(item.coverSha256, source.coverSha256);
    assert.equal(item.captionSha256, createHash("sha256").update(item.caption).digest("hex"));
    assert.equal(Date.parse(item.publishNotAfter) - Date.parse(item.scheduledAt), 90 * 60 * 1_000);
  });
});

test("every TikTok item is exact-approved, analytics-enabled, and bound to licensed audio", () => {
  for (const item of TIKTOK_NINE_DAY_CAMPAIGN_ITEMS) {
    const receipt = tiktokNineDayMusicReceipt(item);
    const settings = tiktokNineDaySettings(item);
    assert.equal(receipt.context.platform, "tiktok");
    assert.equal(receipt.context.postId, item.postId);
    assert.equal(receipt.output.sha256, item.videoSha256);
    assert.deepEqual(receipt.track.license.platforms, ["tiktok"]);
    assert.equal(receipt.track.license.commercialUseAllowed, true);
    assert.equal(settings.exactCreativeApproval.status, "APPROVED_EXACT");
    assert.equal(settings.ownerRightsAttestation.status, "CONFIRMED");
    assert.equal(settings.shareToFacebook, false);
    assert.deepEqual(settings.analytics.snapshotsHours, [2, 24, 72]);
  }
});
