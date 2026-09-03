import assert from "node:assert/strict";
import test from "node:test";

import { FacebookReelsClient, facebookCaptionSha256 } from "./facebook-reels";
import { YouTubeShortsClient, youtubeDescriptionSha256 } from "./youtube-shorts";

test("Facebook and YouTube duplicate fingerprints canonicalize line endings", () => {
  assert.equal(facebookCaptionSha256("ტესტი\r\nHooma  "), facebookCaptionSha256("ტესტი\nHooma"));
  assert.equal(youtubeDescriptionSha256("ტესტი\r\nHooma  "), youtubeDescriptionSha256("ტესტი\nHooma"));
  assert.notEqual(facebookCaptionSha256("ერთი"), facebookCaptionSha256("ორი"));
});

test("Facebook Reels uses the owned-video read edge and the documented hosted-upload authorization", async () => {
  process.env.FACEBOOK_APP_ID = "facebook-app-id";
  process.env.FACEBOOK_APP_SECRET = "facebook-app-secret";
  process.env.FACEBOOK_GRAPH_API_VERSION = "v25.0";
  process.env.FACEBOOK_REDIRECT_URI = "https://hooma.ge/api/social/oauth/facebook/callback";
  process.env.FACEBOOK_EXPECTED_PAGE_ID = "1183394631514623";
  process.env.FACEBOOK_EXPECTED_PAGE_USERNAME = "HoomaGeorgia";
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const responses = [
    { data: [] },
    {
      video_id: "987654321098765",
      upload_url: "https://rupload.facebook.com/video-upload/v25.0/987654321098765",
    },
    { success: true },
    { success: true },
  ];
  globalThis.fetch = async (input, init) => {
    requests.push({ url: String(input), init });
    return new Response(JSON.stringify(responses.shift()), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const client = new FacebookReelsClient();
    await client.lookupOwnedDuplicate({
      pageId: "123456789012345",
      captionSha256: facebookCaptionSha256("Hooma"),
      notBefore: "2026-08-30T00:00:00.000Z",
      maxPages: 5,
    }, "page-access-token");
    const started = await client.startUpload("123456789012345", "page-access-token");
    await client.uploadHostedVideo({
      uploadUrl: started.uploadUrl,
      videoUrl: "https://media.hooma.ge/staged/video.mp4",
      accessToken: "page-access-token",
    });
    await client.finishUpload({
      pageId: "123456789012345",
      videoId: started.videoId,
      caption: "Hooma",
      accessToken: "page-access-token",
    });

    assert.equal(new URL(requests[0]!.url).pathname, "/v25.0/123456789012345/videos");
    assert.equal(new URL(requests[1]!.url).pathname, "/v25.0/123456789012345/video_reels");
    assert.equal(new Headers(requests[2]!.init?.headers).get("authorization"), "OAuth page-access-token");
    assert.equal(new Headers(requests[2]!.init?.headers).get("file_url"), "https://media.hooma.ge/staged/video.mp4");
    assert.equal(new Headers(requests[3]!.init?.headers).get("authorization"), "Bearer page-access-token");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("YouTube resumable metadata declares synthetic media and never notifies subscribers", async () => {
  const originalFetch = globalThis.fetch;
  let observedUrl = "";
  let observedBody: Record<string, unknown> | null = null;
  globalThis.fetch = async (input, init) => {
    observedUrl = String(input);
    observedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response("", {
      status: 200,
      headers: { Location: "https://www.googleapis.com/upload/youtube/v3/videos?upload_id=safe" },
    });
  };
  try {
    const client = new YouTubeShortsClient();
    await client.createResumableSession({
      accessToken: "access-token",
      title: "Hooma #Shorts",
      description: "სატესტო აღწერა",
      sizeBytes: 1_024,
    });
    const url = new URL(observedUrl);
    assert.equal(url.searchParams.get("uploadType"), "resumable");
    assert.equal(url.searchParams.get("notifySubscribers"), "false");
    assert.ok(observedBody);
    const status = observedBody["status"] as Record<string, unknown>;
    assert.equal(status.privacyStatus, "public");
    assert.equal(status.containsSyntheticMedia, true);
    assert.equal(status.selfDeclaredMadeForKids, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
