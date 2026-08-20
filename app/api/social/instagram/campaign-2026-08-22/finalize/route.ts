import { createHash } from "node:crypto";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient, requirePermission } from "@/lib/supabase/server";
import {
  instagramNineDayCampaignItem,
  instagramNineDayMusicReceipt,
  instagramNineDaySettings,
  type InstagramNineDayCampaignItem,
} from "@/lib/social/campaigns/instagram-nine-day-2026-08-22";
import { socialMediaBaseUrl } from "@/lib/social/config";
import { loadInstagramPublishingConnection } from "@/lib/social/connections";
import { SOCIAL_SIGNED_URL_TTL_SECONDS, SOCIAL_STAGING_BUCKET } from "@/lib/social/staging";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store" };
const ZERO_SHA256 = "0".repeat(64);
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_COVER_BYTES = 25 * 1024 * 1024;

function response(status: number, body: Record<string, unknown>) {
  return NextResponse.json(body, { status, headers: HEADERS });
}

function sha256(value: string | Buffer) {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function safeFailure(error: unknown) {
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return /^[A-Z0-9_]{3,80}$/.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

async function productPageAvailable(item: InstagramNineDayCampaignItem) {
  const response = await fetch(item.productUrl, {
    cache: "no-store",
    redirect: "follow",
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: "text/html" },
  });
  const finalUrl = new URL(response.url);
  if (
    !response.ok
    || finalUrl.protocol !== "https:"
    || (finalUrl.hostname !== "hooma.ge" && finalUrl.hostname !== "www.hooma.ge")
    || !response.headers.get("content-type")?.toLowerCase().includes("text/html")
  ) throw new Error("PRODUCT_UNAVAILABLE");
}

async function verifyStagedObject(
  bucket: any,
  objectPath: string,
  expectedSha256: string,
  maximumBytes: number,
  expectedMime: string,
) {
  const downloaded = await bucket.download(objectPath);
  if (downloaded.error || !downloaded.data) throw new Error("STAGED_MEDIA_UNAVAILABLE");
  const blob = downloaded.data as Blob;
  if (blob.size < 1 || blob.size > maximumBytes || blob.type !== expectedMime) {
    throw new Error("STAGED_MEDIA_INVALID");
  }
  const observed = sha256(Buffer.from(await blob.arrayBuffer()));
  if (observed !== expectedSha256) throw new Error("STAGED_MEDIA_HASH_MISMATCH");
  const signed = await bucket.createSignedUrl(objectPath, SOCIAL_SIGNED_URL_TTL_SECONDS);
  const signedUrl = signed.data?.signedUrl;
  if (signed.error || typeof signedUrl !== "string") throw new Error("STAGED_MEDIA_SIGNING_FAILED");
  const observedOrigin = new URL(signedUrl).origin;
  if (observedOrigin !== new URL(socialMediaBaseUrl()).origin) {
    throw new Error("STAGED_MEDIA_ORIGIN_MISMATCH");
  }
  return { sizeBytes: blob.size, sha256: observed };
}

function exactExistingJob(
  row: Record<string, unknown>,
  item: InstagramNineDayCampaignItem,
  accountId: string,
  productId: string,
) {
  const musicReceipt = instagramNineDayMusicReceipt(item);
  const settings = instagramNineDaySettings(item);
  return row.post_id === item.postId
    && row.provider === "instagram"
    && row.account_id === accountId
    && row.product_id === productId
    && row.product_code === item.productCode
    && row.product_url === item.productUrl
    && Date.parse(String(row.scheduled_at)) === Date.parse(item.scheduledAt)
    && Date.parse(String(row.publish_not_after)) === Date.parse(item.publishNotAfter)
    && row.video_object_path === item.videoObjectPath
    && row.video_sha256 === item.videoSha256
    && row.cover_object_path === item.coverObjectPath
    && row.cover_sha256 === item.coverSha256
    && row.caption === item.caption
    && row.music_mode === "HOOMA_OWNED_MASTER"
    && row.rights_status === "CLEARED"
    && row.visual_claims_status === "CLEARED"
    && stableJson(row.music_receipt) === stableJson(musicReceipt)
    && stableJson(row.settings) === stableJson(settings)
    && row.idempotency_key === `instagram-campaign:${item.postId}:${item.videoSha256}`;
}

export async function POST(request: Request) {
  if (new URL(request.url).origin !== "https://hooma.ge") {
    return response(403, { ok: false, status: "ORIGIN_REJECTED" });
  }
  const actor = await requirePermission("team.manage");
  if (!actor) return response(401, { ok: false, status: "UNAUTHORIZED" });
  if (actor.role !== "owner") return response(403, { ok: false, status: "FORBIDDEN" });

  try {
    const body = await request.json() as { postId?: unknown };
    const item = instagramNineDayCampaignItem(body.postId);
    if (!item) return response(404, { ok: false, status: "CAMPAIGN_ITEM_NOT_FOUND" });
    if (sha256(item.caption) !== item.captionSha256) {
      throw new Error("CAPTION_HASH_MISMATCH");
    }

    const admin = createAdminClient() as any;
    if (!admin) throw new Error("DATABASE_UNAVAILABLE");
    const [connection] = await Promise.all([
      loadInstagramPublishingConnection(),
      productPageAvailable(item),
    ]);
    const { data: product, error: productError } = await admin
      .from("products")
      .select("id,slug,status")
      .eq("slug", item.productSlug)
      .eq("status", "active")
      .limit(2);
    if (productError || !Array.isArray(product) || product.length !== 1) {
      throw new Error("PRODUCT_UNAVAILABLE");
    }
    const productId = product[0].id as string;
    const bucket = admin.storage.from(SOCIAL_STAGING_BUCKET);
    const [videoQa, coverQa] = await Promise.all([
      verifyStagedObject(bucket, item.videoObjectPath, item.videoSha256, MAX_VIDEO_BYTES, "video/mp4"),
      verifyStagedObject(bucket, item.coverObjectPath, item.coverSha256, MAX_COVER_BYTES, "image/jpeg"),
    ]);

    const selectedFields = "id,post_id,provider,account_id,product_id,product_code,product_url,scheduled_at,publish_not_after,state,publishing_allowed,approval_status,approval_fingerprint,content_fingerprint,video_object_path,video_sha256,cover_object_path,cover_sha256,caption,music_mode,music_receipt,rights_status,visual_claims_status,settings,idempotency_key";
    const existingRead = await admin
      .from("social_publish_jobs")
      .select(selectedFields)
      .eq("post_id", item.postId)
      .maybeSingle();
    if (existingRead.error) throw new Error("SOCIAL_JOB_READ_FAILED");
    let existing = existingRead.data;

    if (!existing) {
      const insert = await admin.from("social_publish_jobs").insert({
        post_id: item.postId,
        provider: "instagram",
        account_id: connection.externalAccountId,
        product_id: productId,
        product_code: item.productCode,
        product_url: item.productUrl,
        scheduled_at: item.scheduledAt,
        publish_not_after: item.publishNotAfter,
        state: "waiting_for_approval",
        publishing_allowed: false,
        approval_status: "WAITING_FOR_GIORGI",
        approval_fingerprint: null,
        video_object_path: item.videoObjectPath,
        video_sha256: item.videoSha256,
        cover_object_path: item.coverObjectPath,
        cover_sha256: item.coverSha256,
        caption: item.caption,
        caption_sha256: ZERO_SHA256,
        music_mode: "HOOMA_OWNED_MASTER",
        music_receipt: instagramNineDayMusicReceipt(item),
        music_receipt_sha256: ZERO_SHA256,
        rights_status: "CLEARED",
        visual_claims_status: "CLEARED",
        settings: instagramNineDaySettings(item),
        settings_sha256: ZERO_SHA256,
        content_fingerprint: ZERO_SHA256,
        idempotency_key: `instagram-campaign:${item.postId}:${item.videoSha256}`,
        max_attempts: 5,
        created_by: actor.id,
      }).select(selectedFields).single();
      if (insert.error || !insert.data) throw new Error("SOCIAL_JOB_INSERT_FAILED");
      existing = insert.data;
    }

    if (!exactExistingJob(existing as Record<string, unknown>, item, connection.externalAccountId, productId)) {
      throw new Error("SOCIAL_JOB_CONFLICT");
    }
    const contentFingerprint = (existing as Record<string, unknown>).content_fingerprint;
    if (typeof contentFingerprint !== "string" || !/^[a-f0-9]{64}$/.test(contentFingerprint)) {
      throw new Error("SOCIAL_JOB_FINGERPRINT_INVALID");
    }
    const browserDb = await createClient() as any;
    if (!browserDb) throw new Error("DATABASE_UNAVAILABLE");
    const approval = await browserDb.rpc("approve_social_publish_job", {
      requested_job_id: (existing as Record<string, unknown>).id,
      expected_content_fingerprint: contentFingerprint,
    });
    if (approval.error || !approval.data) throw new Error("SOCIAL_JOB_APPROVAL_FAILED");
    const approved = approval.data as Record<string, unknown>;
    if (
      approved.approval_status !== "APPROVED_EXACT"
      || approved.approval_fingerprint !== contentFingerprint
      || approved.publishing_allowed !== true
      || approved.rights_status !== "CLEARED"
      || approved.visual_claims_status !== "CLEARED"
    ) throw new Error("SOCIAL_JOB_APPROVAL_FAILED");

    return response(200, {
      ok: true,
      postId: item.postId,
      status: "APPROVED_EXACT",
      state: approved.state,
      scheduledAt: item.scheduledAt,
      publishNotAfter: item.publishNotAfter,
      contentFingerprint,
      media: { video: videoQa, cover: coverQa },
      shareToFacebook: false,
      analyticsSnapshotsHours: [2, 24, 72],
    });
  } catch (error) {
    const errorCode = safeFailure(error);
    console.error(JSON.stringify({
      level: "error",
      message: "instagram_nine_day_campaign_finalize_failed",
      errorCode,
    }));
    return response(503, { ok: false, status: "FAILED_CLOSED", errorCode });
  }
}
