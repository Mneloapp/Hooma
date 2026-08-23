import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  socialPublishingEnabled,
  tiktokOrganicPublishingEnabled,
} from "./config";
import { loadTikTokPublishingConnection } from "./connections";
import {
  isSocialSha256,
  parseTikTokPublishJob,
  tiktokPublishGateFailures,
  type TikTokPublishJob,
} from "./publish-job";
import {
  TikTokBusinessOrganicClient,
  TikTokOrganicError,
  type TikTokOrganicPublishInput,
} from "./providers/tiktok-business-organic";
import { verifyAndSignTikTokStagedMedia } from "./staging";
import { tiktokOrganicActivation } from "./tiktok-activation";
import {
  TIKTOK_MEDIA_PROXY_PREFIX,
  tiktokMediaDeliveryUrl,
} from "./tiktok-media-delivery";

type JsonObject = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient> & {
  rpc(name: string, args?: JsonObject): Promise<{ data: unknown; error: { code?: string } | null }>;
};

type TikTokLifecycle = {
  jobId: string;
  phase: "PUBLISH_INTENT_RECORDED" | "PROCESSING_REMOTE" | "PUBLISHED" | "FAILED";
  publishOperationId: string;
  publishRequestSha256: string;
  providerPublishId: string | null;
  providerRequestId: string | null;
  providerResponseSha256: string | null;
  providerStatus: string | null;
  providerPostId: string | null;
  providerUrl: string | null;
  failureReason: string | null;
  pollCount: number;
  nextPollAt: string | null;
  dispatchAllowed: boolean;
};

type WorkerOptions = {
  admin?: AdminClient;
  now?: Date;
  connection?: Awaited<ReturnType<typeof loadTikTokPublishingConnection>>;
  client?: TikTokBusinessOrganicClient;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ERROR = /^[A-Z0-9_]{3,80}$/;
const SAFE_ID = /^[A-Za-z0-9._:~-]{1,256}$/;
const TIKTOK_POST_ID = /^[1-9]\d{7,39}$/;
const SENSITIVE_KEY = /access[_-]?token|refresh[_-]?token|authorization|cookie|client[_-]?secret|password|otp|verification[_-]?code/i;

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function nullableText(value: unknown) {
  return value === null || value === undefined ? null : text(value) || null;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as JsonObject)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function sha256Json(value: unknown) {
  return sha256(stableJson(value));
}

function jsonIsRedacted(value: unknown): boolean {
  if (Array.isArray(value)) return value.every(jsonIsRedacted);
  if (!value || typeof value !== "object") return true;
  return Object.entries(value as JsonObject).every(
    ([key, nested]) => !SENSITIVE_KEY.test(key) && jsonIsRedacted(nested),
  );
}

function assertRedacted(value: JsonObject) {
  if (!jsonIsRedacted(value)) throw new Error("SOCIAL_PAYLOAD_NOT_REDACTED");
}

function safeErrorCode(error: unknown) {
  if (error instanceof TikTokOrganicError) return error.code;
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return SAFE_ERROR.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

function policyGateError(failures: string[]) {
  const detailed = `POLICY_GATE_${failures[0] ?? "UNKNOWN"}`;
  return new Error(SAFE_ERROR.test(detailed) ? detailed : "POLICY_GATE_MISMATCH");
}

function parseLifecycle(value: unknown): TikTokLifecycle {
  const row = object(value);
  const phase = text(row?.phase) as TikTokLifecycle["phase"];
  const lifecycle: TikTokLifecycle = {
    jobId: text(row?.job_id),
    phase,
    publishOperationId: text(row?.publish_operation_id),
    publishRequestSha256: text(row?.publish_request_sha256),
    providerPublishId: nullableText(row?.provider_publish_id),
    providerRequestId: nullableText(row?.provider_request_id),
    providerResponseSha256: nullableText(row?.provider_response_sha256),
    providerStatus: nullableText(row?.provider_status),
    providerPostId: nullableText(row?.provider_post_id),
    providerUrl: nullableText(row?.provider_url),
    failureReason: nullableText(row?.failure_reason),
    pollCount: Number(row?.poll_count),
    nextPollAt: nullableText(row?.next_poll_at),
    dispatchAllowed: row?.dispatch_allowed === true,
  };
  if (
    !UUID.test(lifecycle.jobId)
    || !new Set(["PUBLISH_INTENT_RECORDED", "PROCESSING_REMOTE", "PUBLISHED", "FAILED"]).has(phase)
    || !UUID.test(lifecycle.publishOperationId)
    || !isSocialSha256(lifecycle.publishRequestSha256)
    || (lifecycle.providerPublishId !== null && !SAFE_ID.test(lifecycle.providerPublishId))
    || (lifecycle.providerRequestId !== null && !/^[A-Za-z0-9_.:~-]{1,120}$/.test(lifecycle.providerRequestId))
    || (lifecycle.providerResponseSha256 !== null && !isSocialSha256(lifecycle.providerResponseSha256))
    || (lifecycle.providerPostId !== null && !TIKTOK_POST_ID.test(lifecycle.providerPostId))
    || (lifecycle.providerUrl !== null && !/^https:\/\/(?:www\.)?tiktok\.com\//.test(lifecycle.providerUrl))
    || !Number.isInteger(lifecycle.pollCount)
    || lifecycle.pollCount < 0
    || (lifecycle.nextPollAt !== null && !Number.isFinite(Date.parse(lifecycle.nextPollAt)))
  ) throw new Error("TIKTOK_LIFECYCLE_INVALID");
  return lifecycle;
}

async function rpc(admin: AdminClient, name: string, args: JsonObject = {}) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`SOCIAL_DATABASE_RPC_FAILED:${error.code ?? "UNKNOWN"}`);
  return data;
}

async function failJob(
  admin: AdminClient,
  job: TikTokPublishJob,
  error: unknown,
  remoteSideEffectPossible: boolean,
) {
  const errorCode = safeErrorCode(error);
  try {
    await rpc(admin, "fail_social_publish_job", {
      requested_job_id: job.id,
      requested_claim_id: job.claimId,
      provider_request_id: error instanceof TikTokOrganicError ? error.requestId : null,
      requested_error_code: errorCode,
      provider_payload: { error_code: errorCode },
      remote_side_effect_possible: remoteSideEffectPossible,
      requested_retry_at: null,
    });
  } catch {
    // Preserve the original result and never retry around an ambiguous boundary.
  }
}

function captionSha256(job: TikTokPublishJob) {
  return sha256(job.caption);
}

function publishSettings(job: TikTokPublishJob) {
  const settings = job.settings;
  return {
    commentsEnabled: settings.commentsEnabled === true,
    duetEnabled: settings.duetEnabled === true,
    stitchEnabled: settings.stitchEnabled === true,
    aiGeneratedContent: settings.aiGeneratedContent === true,
    commercialContent: settings.commercialContent === true,
    promotionType: settings.promotionType,
    uploadToDraft: settings.uploadToDraft,
    adsOnly: settings.adsOnly,
    shareToFacebook: settings.shareToFacebook,
  } as TikTokOrganicPublishInput["settings"];
}

async function duplicateLookup(
  client: TikTokBusinessOrganicClient,
  job: TikTokPublishJob,
  accessToken: string,
) {
  return client.lookupOwnedPostDuplicate({
    accountId: job.accountId,
    captionSha256: captionSha256(job),
    notBefore: new Date(Date.parse(job.scheduledAt) - 72 * 60 * 60 * 1_000).toISOString(),
    maxPages: 5,
  }, accessToken);
}

function publishInput(
  job: TikTokPublishJob,
  videoSignedUrl: string,
  expiresAt: string,
  urlPropertyReceiptSha256: string,
): TikTokOrganicPublishInput {
  if (job.musicMode !== "TIKTOK_CML" && job.musicMode !== "HOOMA_OWNED_MASTER") {
    throw new Error("TIKTOK_MUSIC_MODE_INVALID");
  }
  return {
    accountId: job.accountId,
    postId: job.postId,
    approvalStatus: "APPROVED_EXACT",
    publishingAllowed: true,
    rightsStatus: "CLEARED",
    visualClaimsStatus: "CLEARED",
    productAvailable: true,
    remoteDuplicateStatus: "CLEAR",
    remoteDuplicateReceiptSha256: job.remoteDuplicateReceiptSha256!,
    scheduledAt: job.scheduledAt,
    publishNotAfter: job.publishNotAfter,
    contentFingerprint: job.contentFingerprint,
    approvalFingerprint: job.approvalFingerprint,
    videoSha256: job.videoSha256,
    caption: job.caption,
    captionSha256: captionSha256(job),
    idempotencyKey: job.idempotencyKey,
    musicMode: job.musicMode,
    musicReceipt: job.musicReceipt,
    settings: publishSettings(job),
    media: {
      videoUrl: videoSignedUrl,
      sha256: job.videoSha256,
      expiresAt,
      signatureReferenceSha256: sha256Json({
        jobId: job.id,
        videoObjectPath: job.videoObjectPath,
        expiresAt,
      }),
      urlPropertyReceiptSha256,
    },
  };
}

async function completePublished(
  admin: AdminClient,
  job: TikTokPublishJob,
  lifecycle: TikTokLifecycle,
) {
  if (
    lifecycle.phase !== "PUBLISHED"
    || !lifecycle.providerPublishId
    || !lifecycle.providerPostId
    || !lifecycle.providerUrl
  ) throw new Error("TIKTOK_PUBLISHED_RESULT_INVALID");
  await rpc(admin, "complete_social_publish_job", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    provider_request_id: lifecycle.providerRequestId,
    provider_request_sha256: lifecycle.publishRequestSha256,
    requested_provider_publish_id: lifecycle.providerPublishId,
    requested_provider_post_id: lifecycle.providerPostId,
    requested_provider_url: lifecycle.providerUrl,
    provider_payload: {
      schema: "tiktok-business-organic-publish-v1.3",
      lifecycle_phase: lifecycle.phase,
      provider_publish_id: lifecycle.providerPublishId,
      provider_post_id: lifecycle.providerPostId,
    },
  });
  return { status: "PUBLISHED" as const, postId: job.postId, remoteMutationAttempted: false };
}

async function recordStatus(
  admin: AdminClient,
  job: TikTokPublishJob,
  lifecycle: TikTokLifecycle,
  status: Awaited<ReturnType<TikTokBusinessOrganicClient["fetchPublishStatus"]>>,
  now: Date,
) {
  const mappedStatus = status.status === "PUBLISHED"
    ? "PUBLISHED"
    : status.status === "FAILED_REVIEW_REQUIRED"
      ? "FAILED"
      : "PROCESSING_REMOTE";
  const nextPollAt = mappedStatus === "PROCESSING_REMOTE"
    ? new Date(now.getTime() + 30_000).toISOString()
    : null;
  return parseLifecycle(await rpc(admin, "record_tiktok_publish_status_v1", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    requested_operation_id: lifecycle.publishOperationId,
    requested_status: mappedStatus,
    requested_provider_request_id: status.providerRequestId,
    requested_provider_response_sha256: status.providerResponseSha256,
    requested_provider_post_id: status.providerPostId,
    requested_provider_url: status.providerUrl,
    requested_failure_reason: mappedStatus === "FAILED" ? status.reason : null,
    requested_event_idempotency_key: `tiktok-publish-status:${job.id}:${lifecycle.publishOperationId}:${lifecycle.pollCount + 1}`,
    requested_event_payload: {
      schema: "tiktok-publish-status-v1",
      content_fingerprint: job.contentFingerprint,
      provider_publish_id: lifecycle.providerPublishId,
    },
    requested_next_poll_at: nextPollAt,
  }));
}

async function pollPublishStatus(
  admin: AdminClient,
  client: TikTokBusinessOrganicClient,
  job: TikTokPublishJob,
  lifecycle: TikTokLifecycle,
  accessToken: string,
  now: Date,
) {
  if (!lifecycle.providerPublishId) throw new Error("TIKTOK_PROVIDER_PUBLISH_ID_MISSING");
  const status = await client.fetchPublishStatus({
    accountId: job.accountId,
    publishId: lifecycle.providerPublishId,
  }, accessToken);
  lifecycle = await recordStatus(admin, job, lifecycle, status, now);
  if (lifecycle.phase === "PUBLISHED") return completePublished(admin, job, lifecycle);
  if (lifecycle.phase === "FAILED") {
    await failJob(admin, job, new Error("TIKTOK_REMOTE_PUBLISH_FAILED"), false);
    return { status: "FAILED_REMOTE" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  return { status: "PROCESSING_REMOTE" as const, postId: job.postId, remoteMutationAttempted: false };
}

async function startNewJob(
  admin: AdminClient,
  client: TikTokBusinessOrganicClient,
  job: TikTokPublishJob,
  accessToken: string,
  urlPropertyReceiptSha256: string,
  now: Date,
) {
  const failures = tiktokPublishGateFailures(job, "claimed", now);
  if (failures.length) {
    const error = policyGateError(failures);
    await failJob(admin, job, error, false);
    return { status: "BLOCKED_POLICY" as const, postId: job.postId, gates: failures, errorCode: safeErrorCode(error), remoteMutationAttempted: false };
  }
  const media = await verifyAndSignTikTokStagedMedia(admin, job, now);
  const [accountSettings, urlProperty] = await Promise.all([
    client.fetchVideoSettings({ accountId: job.accountId }, accessToken),
    client.fetchUrlPropertyStatus({ mediaBaseUrl: TIKTOK_MEDIA_PROXY_PREFIX }),
  ]);
  if (
    !accountSettings.publicPostingAvailable
    || (job.settings.commentsEnabled === true && accountSettings.commentDisabled)
    || (job.settings.duetEnabled === true && accountSettings.duetDisabled)
    || (job.settings.stitchEnabled === true && accountSettings.stitchDisabled)
  ) throw new Error("TIKTOK_ACCOUNT_SETTINGS_CONFLICT");
  if (urlProperty.status !== "VERIFIED") throw new Error("TIKTOK_URL_PROPERTY_NOT_VERIFIED");
  const duplicate = await duplicateLookup(client, job, accessToken);
  const duplicatePayload = {
    schema: "tiktok-owned-post-duplicate-v1",
    status: duplicate.status,
    scanned_count: duplicate.scannedCount,
    caption_sha256: captionSha256(job),
    duplicate_post_id: duplicate.duplicate?.postId ?? null,
    duplicate_provider_url: duplicate.duplicate?.providerUrl ?? null,
  };
  assertRedacted(duplicatePayload);
  const duplicateReceiptSha256 = sha256Json(duplicatePayload);
  if (duplicate.status === "DUPLICATE") {
    await rpc(admin, "block_social_publish_remote_duplicate", {
      requested_job_id: job.id,
      requested_claim_id: job.claimId,
      duplicate_receipt_sha256: duplicateReceiptSha256,
      duplicate_payload: duplicatePayload,
    });
    return { status: "BLOCKED_REMOTE_DUPLICATE" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  if (duplicate.status !== "CLEAR") throw new Error("REMOTE_DUPLICATE_CHECK_INCONCLUSIVE");
  const qaReceipt = {
    schema: "tiktok-staged-media-qa-v1",
    content_fingerprint: job.contentFingerprint,
    video_sha256: media.video.sha256,
    cover_sha256: media.cover?.sha256 ?? null,
    video_size_bytes: media.video.sizeBytes,
    cover_size_bytes: media.cover?.sizeBytes ?? null,
    signed_url_expires_at: media.expiresAt,
  };
  const authorized = parseTikTokPublishJob(await rpc(admin, "authorize_social_publish_job", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    observed_video_sha256: media.video.sha256,
    observed_content_fingerprint: job.contentFingerprint,
    qa_receipt_sha256: sha256Json(qaReceipt),
    remote_duplicate_receipt_sha256: duplicateReceiptSha256,
    preflight_payload: { qa: qaReceipt, duplicate: duplicatePayload },
  }));
  const publishingFailures = tiktokPublishGateFailures(authorized, "publishing", now);
  if (publishingFailures.length) throw policyGateError(publishingFailures);
  const input = publishInput(
    authorized,
    tiktokMediaDeliveryUrl(media.video.signedUrl, media.video.sha256),
    media.expiresAt,
    urlPropertyReceiptSha256,
  );
  const prepared = client.preparePublishVideo(input);
  let lifecycle = parseLifecycle(await rpc(admin, "begin_tiktok_publish_v1", {
    requested_job_id: authorized.id,
    requested_claim_id: authorized.claimId,
    requested_idempotency_key: `tiktok-publish:${authorized.id}:${authorized.attempts}`,
    requested_request_sha256: prepared.providerRequestSha256,
    requested_event_idempotency_key: `tiktok-publish-intent:${authorized.id}:${authorized.attempts}`,
    requested_receipt_payload: {
      schema: "tiktok-publish-intent-v1",
      content_fingerprint: authorized.contentFingerprint,
      video_sha256: authorized.videoSha256,
      caption_sha256: captionSha256(authorized),
      music_mode: authorized.musicMode,
      music_receipt_sha256: prepared.musicReceiptSha256,
    },
  }));
  if (!lifecycle.dispatchAllowed) {
    await failJob(admin, authorized, new Error("REMOTE_RESULT_UNCERTAIN"), true);
    return { status: "REMOTE_RESULT_UNCERTAIN" as const, postId: authorized.postId, remoteMutationAttempted: false };
  }
  try {
    const accepted = await client.publishVideo(input, accessToken);
    if (accepted.providerRequestSha256 !== prepared.providerRequestSha256) {
      throw new Error("TIKTOK_PUBLISH_REQUEST_HASH_MISMATCH");
    }
    lifecycle = parseLifecycle(await rpc(admin, "record_tiktok_publish_accepted_v1", {
      requested_job_id: authorized.id,
      requested_claim_id: authorized.claimId,
      requested_operation_id: lifecycle.publishOperationId,
      requested_provider_publish_id: accepted.providerPublishId,
      requested_provider_request_id: accepted.providerRequestId,
      requested_provider_response_sha256: accepted.providerResponseSha256,
      requested_event_idempotency_key: `tiktok-publish-accepted:${authorized.id}:${lifecycle.publishOperationId}`,
      requested_event_payload: {
        schema: "tiktok-publish-accepted-v1",
        content_fingerprint: authorized.contentFingerprint,
      },
      requested_next_poll_at: new Date(now.getTime() + 30_000).toISOString(),
    }));
    try {
      const result = await pollPublishStatus(admin, client, authorized, lifecycle, accessToken, now);
      return { ...result, remoteMutationAttempted: true };
    } catch (error) {
      return {
        status: "PROCESSING_REMOTE" as const,
        postId: authorized.postId,
        errorCode: safeErrorCode(error),
        remoteMutationAttempted: true,
      };
    }
  } catch (error) {
    await failJob(admin, authorized, error, true);
    return {
      status: "REMOTE_RESULT_UNCERTAIN" as const,
      postId: authorized.postId,
      errorCode: safeErrorCode(error),
      remoteMutationAttempted: true,
    };
  }
}

async function resumeJob(
  admin: AdminClient,
  client: TikTokBusinessOrganicClient,
  job: TikTokPublishJob,
  lifecycle: TikTokLifecycle,
  accessToken: string,
  now: Date,
) {
  if (lifecycle.phase === "PUBLISH_INTENT_RECORDED") {
    await failJob(admin, job, new Error("REMOTE_RESULT_UNCERTAIN"), true);
    return { status: "REMOTE_RESULT_UNCERTAIN" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  if (lifecycle.phase === "PROCESSING_REMOTE") {
    return pollPublishStatus(admin, client, job, lifecycle, accessToken, now);
  }
  if (lifecycle.phase === "PUBLISHED") return completePublished(admin, job, lifecycle);
  await failJob(admin, job, new Error("TIKTOK_REMOTE_PUBLISH_FAILED"), false);
  return { status: "FAILED_REMOTE" as const, postId: job.postId, remoteMutationAttempted: false };
}

export async function runTikTokPublishWorker(options: WorkerOptions = {}) {
  if (!socialPublishingEnabled() || !tiktokOrganicPublishingEnabled()) {
    return { status: "DISABLED" as const, externalActionsPerformed: false, result: null };
  }
  const admin = options.admin ?? createAdminClient() as AdminClient;
  if (!admin) return { status: "BLOCKED_DATABASE_UNAVAILABLE" as const, externalActionsPerformed: false, result: null };
  const now = options.now ?? new Date();
  try {
    const connection = options.connection ?? await loadTikTokPublishingConnection(now);
    const activation = tiktokOrganicActivation(connection);
    const client = options.client ?? new TikTokBusinessOrganicClient({
      activation,
      networkEnabled: true,
      publishingEnabled: true,
    });
    const resumedRaw = await rpc(admin, "claim_due_tiktok_publish_work_v1");
    if (resumedRaw !== null) {
      const row = object(resumedRaw);
      const job = parseTikTokPublishJob(row);
      const lifecycle = parseLifecycle(row?.tiktok_lifecycle);
      const result = await resumeJob(admin, client, job, lifecycle, connection.accessToken, now);
      return { status: "COMPLETE" as const, externalActionsPerformed: result.remoteMutationAttempted, result };
    }
    const claimedRaw = await rpc(admin, "claim_due_social_publish_job", {
      requested_provider: "tiktok",
      requested_worker_window_minutes: 5,
    });
    if (claimedRaw === null) return { status: "IDLE" as const, externalActionsPerformed: false, result: null };
    const job = parseTikTokPublishJob(claimedRaw);
    try {
      const result = await startNewJob(
        admin,
        client,
        job,
        connection.accessToken,
        activation.urlPropertyReceiptSha256,
        now,
      );
      return { status: "COMPLETE" as const, externalActionsPerformed: result.remoteMutationAttempted, result };
    } catch (error) {
      await failJob(admin, job, error, false);
      return {
        status: "COMPLETE" as const,
        externalActionsPerformed: false,
        result: { status: "FAILED_CLOSED" as const, postId: job.postId, errorCode: safeErrorCode(error) },
      };
    }
  } catch (error) {
    return {
      status: "FAILED_CLOSED" as const,
      externalActionsPerformed: false,
      result: { errorCode: safeErrorCode(error) },
    };
  }
}
