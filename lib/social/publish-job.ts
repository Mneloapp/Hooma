import "server-only";

const SHA256 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type InstagramPublishJob = {
  id: string;
  postId: string;
  accountId: string;
  scheduledAt: string;
  publishNotAfter: string;
  state: "claimed" | "publishing";
  publishingAllowed: boolean;
  approvalStatus: string;
  approvalFingerprint: string;
  contentFingerprint: string;
  rightsStatus: string;
  visualClaimsStatus: string;
  videoObjectPath: string;
  videoSha256: string;
  coverObjectPath: string | null;
  coverSha256: string | null;
  caption: string;
  musicMode: string;
  musicReceipt: Record<string, unknown>;
  settings: Record<string, unknown>;
  idempotencyKey: string;
  attempts: number;
  maxAttempts: number;
  claimId: string;
  claimExpiresAt: string;
  remoteDuplicateStatus: string;
  remoteDuplicateReceiptSha256: string | null;
  providerPostId: string | null;
};

export type TikTokPublishJob = Omit<InstagramPublishJob, "state"> & {
  state: "claimed" | "publishing";
};

export type FacebookPublishJob = Omit<InstagramPublishJob, "state"> & {
  state: "claimed" | "publishing";
};

export type YouTubePublishJob = Omit<InstagramPublishJob, "state"> & {
  state: "claimed" | "publishing";
};

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  return value === null || value === undefined ? null : text(value) || null;
}

function safeObjectPath(value: string) {
  return value.length > 0
    && value.length <= 1_024
    && !value.startsWith("/")
    && !value.split("/").includes("..")
    && !value.includes("\\")
    && !value.includes("\0");
}

function parseSocialPublishJob(
  value: unknown,
  provider: "instagram" | "tiktok" | "facebook" | "youtube",
): InstagramPublishJob | TikTokPublishJob | FacebookPublishJob | YouTubePublishJob {
  const row = object(value);
  const errorCode = `${provider.toUpperCase()}_JOB_INVALID`;
  if (!row || row.provider !== provider) throw new Error(errorCode);
  const coverObjectPath = nullableText(row.cover_object_path);
  const coverSha256 = nullableText(row.cover_sha256);
  const job: InstagramPublishJob = {
    id: text(row.id),
    postId: text(row.post_id),
    accountId: text(row.account_id),
    scheduledAt: text(row.scheduled_at),
    publishNotAfter: text(row.publish_not_after),
    state: row.state === "publishing" ? "publishing" : "claimed",
    publishingAllowed: row.publishing_allowed === true,
    approvalStatus: text(row.approval_status),
    approvalFingerprint: text(row.approval_fingerprint),
    contentFingerprint: text(row.content_fingerprint),
    rightsStatus: text(row.rights_status),
    visualClaimsStatus: text(row.visual_claims_status),
    videoObjectPath: text(row.video_object_path),
    videoSha256: text(row.video_sha256),
    coverObjectPath,
    coverSha256,
    caption: text(row.caption),
    musicMode: text(row.music_mode),
    musicReceipt: object(row.music_receipt) ?? {},
    settings: object(row.settings) ?? {},
    idempotencyKey: text(row.idempotency_key),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    claimId: text(row.claim_id),
    claimExpiresAt: text(row.claim_expires_at),
    remoteDuplicateStatus: text(row.remote_duplicate_status),
    remoteDuplicateReceiptSha256: nullableText(row.remote_duplicate_receipt_sha256),
    providerPostId: nullableText(row.provider_post_id),
  };
  if (
    !UUID.test(job.id)
    || !UUID.test(job.claimId)
    || !job.postId
    || (provider === "instagram" || provider === "facebook"
      ? !/^[1-9]\d{0,255}$/.test(job.accountId)
      : provider === "youtube"
        ? !/^UC[A-Za-z0-9_-]{22}$/.test(job.accountId)
        : !/^[A-Za-z0-9._:~-]{1,256}$/.test(job.accountId))
    || !safeObjectPath(job.videoObjectPath)
    || !SHA256.test(job.videoSha256)
    || !SHA256.test(job.contentFingerprint)
    || !SHA256.test(job.approvalFingerprint)
    || (job.coverObjectPath !== null && !safeObjectPath(job.coverObjectPath))
    || (job.coverObjectPath === null) !== (job.coverSha256 === null)
    || (job.coverSha256 !== null && !SHA256.test(job.coverSha256))
    || !job.caption
    || !job.idempotencyKey
    || !Number.isInteger(job.attempts)
    || !Number.isInteger(job.maxAttempts)
    || !Number.isFinite(Date.parse(job.scheduledAt))
    || !Number.isFinite(Date.parse(job.publishNotAfter))
    || !Number.isFinite(Date.parse(job.claimExpiresAt))
    || !object(row.music_receipt)
    || !object(row.settings)
  ) throw new Error(errorCode);
  return job;
}

export function parseInstagramPublishJob(value: unknown): InstagramPublishJob {
  return parseSocialPublishJob(value, "instagram") as InstagramPublishJob;
}

export function parseTikTokPublishJob(value: unknown): TikTokPublishJob {
  return parseSocialPublishJob(value, "tiktok") as TikTokPublishJob;
}

export function parseFacebookPublishJob(value: unknown): FacebookPublishJob {
  return parseSocialPublishJob(value, "facebook") as FacebookPublishJob;
}

export function parseYouTubePublishJob(value: unknown): YouTubePublishJob {
  return parseSocialPublishJob(value, "youtube") as YouTubePublishJob;
}

export function instagramPublishGateFailures(
  job: InstagramPublishJob,
  expectedState: InstagramPublishJob["state"],
  now = new Date(),
) {
  return socialPublishGateFailures(job, expectedState, now);
}

export function tiktokPublishGateFailures(
  job: TikTokPublishJob,
  expectedState: TikTokPublishJob["state"],
  now = new Date(),
) {
  return socialPublishGateFailures(job, expectedState, now);
}

export function facebookPublishGateFailures(
  job: FacebookPublishJob,
  expectedState: FacebookPublishJob["state"],
  now = new Date(),
) {
  return socialPublishGateFailures(job, expectedState, now);
}

export function youtubePublishGateFailures(
  job: YouTubePublishJob,
  expectedState: YouTubePublishJob["state"],
  now = new Date(),
) {
  return socialPublishGateFailures(job, expectedState, now);
}

function socialPublishGateFailures(
  job: InstagramPublishJob | TikTokPublishJob | FacebookPublishJob | YouTubePublishJob,
  expectedState: "claimed" | "publishing",
  now: Date,
) {
  const failures: string[] = [];
  if (job.state !== expectedState) failures.push("STATE_MISMATCH");
  if (!job.publishingAllowed) failures.push("PUBLISHING_NOT_ALLOWED");
  if (job.approvalStatus !== "APPROVED_EXACT") failures.push("EXACT_APPROVAL_REQUIRED");
  if (job.approvalFingerprint !== job.contentFingerprint) failures.push("APPROVAL_FINGERPRINT_MISMATCH");
  if (job.rightsStatus !== "CLEARED") failures.push("RIGHTS_NOT_CLEARED");
  if (job.visualClaimsStatus !== "CLEARED") failures.push("VISUAL_CLAIMS_NOT_CLEARED");
  if (job.providerPostId !== null) failures.push("ALREADY_HAS_REMOTE_POST");
  if (Date.parse(job.scheduledAt) > now.getTime()) failures.push("NOT_DUE");
  if (Date.parse(job.publishNotAfter) < now.getTime()) failures.push("PUBLISH_WINDOW_EXPIRED");
  if (Date.parse(job.claimExpiresAt) <= now.getTime()) failures.push("CLAIM_EXPIRED");
  if (expectedState === "publishing") {
    if (job.remoteDuplicateStatus !== "CLEAR") failures.push("REMOTE_DUPLICATE_NOT_CLEARED");
    if (!job.remoteDuplicateReceiptSha256 || !SHA256.test(job.remoteDuplicateReceiptSha256)) {
      failures.push("REMOTE_DUPLICATE_RECEIPT_MISSING");
    }
  }
  return [...new Set(failures)];
}

export function isSocialSha256(value: unknown): value is string {
  return typeof value === "string" && SHA256.test(value);
}
