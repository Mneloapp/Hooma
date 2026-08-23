import assert from "node:assert/strict";
import test from "node:test";

import {
  decodeTikTokMediaSource,
  tiktokMediaDeliveryUrl,
} from "./tiktok-media-delivery";

const SHA = "a".repeat(64);
const SOURCE = `https://qlagrwxuvfzbmxttdvtq.supabase.co/storage/v1/object/sign/social-publishing-staging/tiktok/campaign/post/${SHA}.mp4?token=signed-token`;

test("TikTok delivery proxy is hash-bound to an exact private staging URL", () => {
  process.env.HOOMA_SOCIAL_MEDIA_BASE_URL = "https://qlagrwxuvfzbmxttdvtq.supabase.co";
  const delivery = new URL(tiktokMediaDeliveryUrl(SOURCE, SHA));
  assert.equal(delivery.origin, "https://hooma.ge");
  assert.equal(delivery.pathname, `/api/social/tiktok/media/${SHA}.mp4`);
  assert.equal(decodeTikTokMediaSource(delivery.searchParams.get("source")!, `${SHA}.mp4`).toString(), SOURCE);
});

test("TikTok delivery proxy rejects another bucket, host, or media hash", () => {
  process.env.HOOMA_SOCIAL_MEDIA_BASE_URL = "https://qlagrwxuvfzbmxttdvtq.supabase.co";
  assert.throws(
    () => tiktokMediaDeliveryUrl(SOURCE.replace("social-publishing-staging", "product-media"), SHA),
    /TIKTOK_MEDIA_SOURCE_INVALID/,
  );
  assert.throws(
    () => tiktokMediaDeliveryUrl(SOURCE.replace("qlagrwxuvfzbmxttdvtq.supabase.co", "example.com"), SHA),
    /TIKTOK_MEDIA_SOURCE_INVALID/,
  );
  assert.throws(() => tiktokMediaDeliveryUrl(SOURCE, "b".repeat(64)), /BINDING_MISMATCH/);
});
