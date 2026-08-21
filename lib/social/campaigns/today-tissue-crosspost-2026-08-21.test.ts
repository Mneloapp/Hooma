import assert from "node:assert/strict";
import test from "node:test";

import {
  TODAY_TISSUE_CROSSPOST_CAMPAIGN_ID,
  TODAY_TISSUE_CROSSPOST_ITEMS,
  todayTissueCrosspostMusicReceipt,
  todayTissueCrosspostSettings,
} from "./today-tissue-crosspost-2026-08-21";

test("today's exact tissue-box test has new identities and preserves the approved master", () => {
  assert.equal(TODAY_TISSUE_CROSSPOST_ITEMS.length, 2);
  assert.deepEqual(
    TODAY_TISSUE_CROSSPOST_ITEMS.map((item) => item.platform).sort(),
    ["instagram", "tiktok"],
  );
  for (const item of TODAY_TISSUE_CROSSPOST_ITEMS) {
    assert.match(item.postId, /^P-20260821-(IG|TT)-2000-TISSUE-BOX$/);
    assert.match(item.sourcePostId, /^P-20260830-(IG|TT)-2000-TISSUE-BOX$/);
    assert.notEqual(item.postId, item.sourcePostId);
    assert.equal(item.scheduledAt, "2026-08-21T20:00:00+04:00");
    assert.equal(item.publishNotAfter, "2026-08-21T21:30:00+04:00");
    assert.equal(item.videoSha256, "da814e65a5c5c4753799d4b8af4bcbdf783e9da3ebc9c48263d5c28b3629e81d");
    assert.equal(item.coverSha256, "a7f39739e65f5e8dcba8314f6cd4457738b7cea9ad3cf6723b7a367b4e90c801");
    assert.match(item.videoObjectPath, /P-20260830-IG-2000-TISSUE-BOX/);

    const receipt = todayTissueCrosspostMusicReceipt(item);
    assert.equal(receipt.context.campaignId, TODAY_TISSUE_CROSSPOST_CAMPAIGN_ID);
    assert.equal(receipt.context.postId, item.postId);
    assert.equal(receipt.context.platform, item.platform);
    assert.equal(receipt.output.sha256, item.videoSha256);
    assert.equal(receipt.track.commercialUseAllowed, true);

    const settings = todayTissueCrosspostSettings(item);
    assert.equal(settings.exactCreativeApproval.status, "APPROVED_EXACT");
    assert.equal(settings.ownerRightsAttestation.status, "CONFIRMED");
    assert.deepEqual(settings.analytics.snapshotsHours, [2, 24, 72]);
    assert.equal(settings.approvedPublishWindow.scheduledAt, item.scheduledAt);
    assert.equal(settings.approvedPublishWindow.publishNotAfter, item.publishNotAfter);
  }
});

test("the test remains cross-platform fail-closed", () => {
  const instagram = TODAY_TISSUE_CROSSPOST_ITEMS.find((item) => item.platform === "instagram");
  const tiktok = TODAY_TISSUE_CROSSPOST_ITEMS.find((item) => item.platform === "tiktok");
  assert.ok(instagram);
  assert.ok(tiktok);
  const instagramSettings = todayTissueCrosspostSettings(instagram);
  const tiktokSettings = todayTissueCrosspostSettings(tiktok);
  assert.equal("shareToFacebook" in instagramSettings && instagramSettings.shareToFacebook, false);
  assert.equal("facebookEnabled" in instagramSettings && instagramSettings.facebookEnabled, false);
  assert.equal("uploadToDraft" in tiktokSettings && tiktokSettings.uploadToDraft, false);
  assert.equal("adsOnly" in tiktokSettings && tiktokSettings.adsOnly, false);
});
