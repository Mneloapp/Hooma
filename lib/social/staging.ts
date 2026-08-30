import "server-only";

import { createHash } from "node:crypto";
import { socialMediaBaseUrl } from "./config";
import type {
  FacebookPublishJob,
  InstagramPublishJob,
  TikTokPublishJob,
  YouTubePublishJob,
} from "./publish-job";

export const SOCIAL_STAGING_BUCKET = "social-publishing-staging";
// Meta can fetch the Reel asynchronously after container creation. Keep the
// immutable object URL alive for a full hour; the hash is verified immediately
// before signing and the bucket remains private.
export const SOCIAL_SIGNED_URL_TTL_SECONDS = 3_600;
const MAX_VIDEO_BYTES = 512 * 1024 * 1024;
const MAX_COVER_BYTES = 25 * 1024 * 1024;

type StorageAdmin = {
  storage: {
    from(bucket: string): {
      download(path: string): Promise<{ data: Blob | null; error: unknown }>;
      createSignedUrl(path: string, expiresIn: number): Promise<{
        data: { signedUrl?: string } | null;
        error: unknown;
      }>;
    };
  };
};

export type VerifiedSocialStagedMedia = {
  video: { signedUrl: string; sha256: string; sizeBytes: number };
  cover: { signedUrl: string; sha256: string; sizeBytes: number } | null;
  expiresAt: string;
};

async function sha256(blob: Blob) {
  const value = await blob.arrayBuffer();
  return createHash("sha256").update(Buffer.from(value)).digest("hex");
}

function assertSignedUrl(value: unknown) {
  if (typeof value !== "string") throw new Error("SOCIAL_SIGNED_URL_INVALID");
  const url = new URL(value);
  const base = new URL(socialMediaBaseUrl());
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.hash
    || url.origin !== base.origin
  ) throw new Error("SOCIAL_SIGNED_URL_INVALID");
  return url.toString();
}

async function verifyAndSign(
  admin: StorageAdmin,
  objectPath: string,
  expectedSha256: string,
  maximumBytes: number,
) {
  const bucket = admin.storage.from(SOCIAL_STAGING_BUCKET);
  const downloaded = await bucket.download(objectPath);
  if (downloaded.error || !downloaded.data) throw new Error("SOCIAL_STAGED_MEDIA_UNAVAILABLE");
  if (downloaded.data.size < 1 || downloaded.data.size > maximumBytes) {
    throw new Error("SOCIAL_STAGED_MEDIA_SIZE_INVALID");
  }
  const observedSha256 = await sha256(downloaded.data);
  if (observedSha256 !== expectedSha256) throw new Error("SOCIAL_STAGED_MEDIA_HASH_MISMATCH");
  const signed = await bucket.createSignedUrl(objectPath, SOCIAL_SIGNED_URL_TTL_SECONDS);
  if (signed.error) throw new Error("SOCIAL_SIGNED_URL_CREATE_FAILED");
  return {
    signedUrl: assertSignedUrl(signed.data?.signedUrl),
    sha256: observedSha256,
    sizeBytes: downloaded.data.size,
  };
}

export async function verifyAndSignInstagramStagedMedia(
  admin: StorageAdmin,
  job: InstagramPublishJob,
  now = new Date(),
): Promise<VerifiedSocialStagedMedia> {
  return verifyAndSignSocialStagedMedia(admin, job, now);
}

export async function verifyAndSignTikTokStagedMedia(
  admin: StorageAdmin,
  job: TikTokPublishJob,
  now = new Date(),
): Promise<VerifiedSocialStagedMedia> {
  return verifyAndSignSocialStagedMedia(admin, job, now);
}

export async function verifyAndSignFacebookStagedMedia(
  admin: StorageAdmin,
  job: FacebookPublishJob,
  now = new Date(),
): Promise<VerifiedSocialStagedMedia> {
  return verifyAndSignSocialStagedMedia(admin, job, now);
}

export async function verifyAndSignYouTubeStagedMedia(
  admin: StorageAdmin,
  job: YouTubePublishJob,
  now = new Date(),
): Promise<VerifiedSocialStagedMedia> {
  return verifyAndSignSocialStagedMedia(admin, job, now);
}

async function verifyAndSignSocialStagedMedia(
  admin: StorageAdmin,
  job: InstagramPublishJob | TikTokPublishJob | FacebookPublishJob | YouTubePublishJob,
  now: Date,
): Promise<VerifiedSocialStagedMedia> {
  const video = await verifyAndSign(admin, job.videoObjectPath, job.videoSha256, MAX_VIDEO_BYTES);
  const cover = job.coverObjectPath && job.coverSha256
    ? await verifyAndSign(admin, job.coverObjectPath, job.coverSha256, MAX_COVER_BYTES)
    : null;
  return {
    video,
    cover,
    expiresAt: new Date(now.getTime() + SOCIAL_SIGNED_URL_TTL_SECONDS * 1_000).toISOString(),
  };
}
