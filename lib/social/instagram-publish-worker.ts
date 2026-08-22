import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { socialPublishingEnabled, instagramPublishingEnabled } from "./config";
import { loadInstagramPublishingConnection } from "./connections";
import { instagramPublishActivation, instagramReadActivation } from "./instagram-activation";
import {
  instagramPublishGateFailures,
  isSocialSha256,
  parseInstagramPublishJob,
  type InstagramPublishJob,
} from "./publish-job";
import {
  InstagramReelsPublishClient,
  InstagramReelsPublishError,
} from "./providers/instagram-reels-publish";
import { InstagramReelsReadClient } from "./providers/instagram-reels-read";
import { verifyAndSignInstagramStagedMedia } from "./staging";

type JsonObject = Record<string, unknown>;

type InstagramLifecycle = {
  jobId: string;
  phase:
    | "CREATE_INTENT_RECORDED"
    | "CONTAINER_PROCESSING"
    | "CONTAINER_READY"
    | "CONTAINER_FAILED"
    | "MEDIA_PUBLISH_INTENT_RECORDED"
    | "MEDIA_PUBLISH_OUTCOME_UNKNOWN"
    | "MEDIA_PUBLISH_CONFIRMED"
    | "MEDIA_PUBLISH_REJECTED";
  containerCreateOperationId: string;
  containerCreateRequestSha256: string;
  providerContainerId: string | null;
  providerContainerStatus: string | null;
  pollCount: number;
  mediaPublishOperationId: string | null;
  mediaPublishRequestSha256: string | null;
  mediaPublishOutcome: string | null;
  providerPostId: string | null;
  providerPermalink: string | null;
  dispatchAllowed: boolean;
  resumeAction: string;
};

type AdminClient = ReturnType<typeof createAdminClient> & {
  rpc(name: string, args?: JsonObject): Promise<{ data: unknown; error: { code?: string } | null }>;
};

type WorkerOptions = {
  admin?: AdminClient;
  now?: Date;
  connection?: Awaited<ReturnType<typeof loadInstagramPublishingConnection>>;
  readClient?: InstagramReelsReadClient;
  publishClient?: InstagramReelsPublishClient;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INSTAGRAM_ID = /^[1-9]\d{0,255}$/;
const SAFE_ERROR = /^[A-Z0-9_]{3,80}$/;
const SENSITIVE_KEY = /access[_-]?token|refresh[_-]?token|authorization|cookie|client[_-]?secret|password|otp|verification[_-]?code/i;
const UNKNOWN_OUTCOME_RECONCILIATION_GRACE_MS = 15 * 60 * 1_000;

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

function safeErrorCode(error: unknown) {
  if (error instanceof InstagramReelsPublishError) return error.code;
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return SAFE_ERROR.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

function assertRedacted(value: JsonObject) {
  if (!jsonIsRedacted(value)) throw new Error("SOCIAL_PAYLOAD_NOT_REDACTED");
}

function parseLifecycle(value: unknown): InstagramLifecycle {
  const row = object(value);
  const phases = new Set([
    "CREATE_INTENT_RECORDED",
    "CONTAINER_PROCESSING",
    "CONTAINER_READY",
    "CONTAINER_FAILED",
    "MEDIA_PUBLISH_INTENT_RECORDED",
    "MEDIA_PUBLISH_OUTCOME_UNKNOWN",
    "MEDIA_PUBLISH_CONFIRMED",
    "MEDIA_PUBLISH_REJECTED",
  ]);
  const lifecycle: InstagramLifecycle = {
    jobId: text(row?.job_id),
    phase: text(row?.phase) as InstagramLifecycle["phase"],
    containerCreateOperationId: text(row?.container_create_operation_id),
    containerCreateRequestSha256: text(row?.container_create_request_sha256),
    providerContainerId: nullableText(row?.provider_container_id),
    providerContainerStatus: nullableText(row?.provider_container_status),
    pollCount: Number(row?.poll_count),
    mediaPublishOperationId: nullableText(row?.media_publish_operation_id),
    mediaPublishRequestSha256: nullableText(row?.media_publish_request_sha256),
    mediaPublishOutcome: nullableText(row?.media_publish_outcome),
    providerPostId: nullableText(row?.provider_post_id),
    providerPermalink: nullableText(row?.provider_permalink),
    dispatchAllowed: row?.dispatch_allowed === true,
    resumeAction: text(row?.resume_action),
  };
  if (
    !UUID.test(lifecycle.jobId)
    || !phases.has(lifecycle.phase)
    || !UUID.test(lifecycle.containerCreateOperationId)
    || !isSocialSha256(lifecycle.containerCreateRequestSha256)
    || (lifecycle.providerContainerId !== null && !INSTAGRAM_ID.test(lifecycle.providerContainerId))
    || !Number.isInteger(lifecycle.pollCount)
    || lifecycle.pollCount < 0
    || (lifecycle.mediaPublishOperationId !== null && !UUID.test(lifecycle.mediaPublishOperationId))
    || (lifecycle.mediaPublishRequestSha256 !== null && !isSocialSha256(lifecycle.mediaPublishRequestSha256))
    || (lifecycle.providerPostId !== null && !INSTAGRAM_ID.test(lifecycle.providerPostId))
    || (lifecycle.providerPermalink !== null && !/^https:\/\/(?:www\.)?instagram\.com\//.test(lifecycle.providerPermalink))
    || !lifecycle.resumeAction
  ) throw new Error("INSTAGRAM_LIFECYCLE_INVALID");
  return lifecycle;
}

async function rpc(admin: AdminClient, name: string, args: JsonObject = {}) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`SOCIAL_DATABASE_RPC_FAILED:${error.code ?? "UNKNOWN"}`);
  return data;
}

async function failJob(
  admin: AdminClient,
  job: InstagramPublishJob,
  error: unknown,
  remotePublishedPossible: boolean,
) {
  const errorCode = safeErrorCode(error);
  try {
    await rpc(admin, "fail_social_publish_job", {
      requested_job_id: job.id,
      requested_claim_id: job.claimId,
      provider_request_id: null,
      requested_error_code: errorCode,
      provider_payload: { error_code: errorCode },
      remote_side_effect_possible: remotePublishedPossible,
      requested_retry_at: null,
    });
  } catch {
    // Preserve the first failure; never manufacture a retry around ambiguity.
  }
}

function captionSha256(job: InstagramPublishJob) {
  return sha256(job.caption);
}

async function duplicateLookup(
  readClient: InstagramReelsReadClient,
  job: InstagramPublishJob,
  accessToken: string,
) {
  const notBefore = new Date(Date.parse(job.scheduledAt) - 72 * 60 * 60 * 1_000).toISOString();
  return readClient.lookupOwnedReelDuplicate({
    accountId: job.accountId,
    captionSha256: captionSha256(job),
    notBefore,
    maxPages: 5,
  }, accessToken);
}

async function completeConfirmed(
  admin: AdminClient,
  job: InstagramPublishJob,
  lifecycle: InstagramLifecycle,
) {
  if (
    lifecycle.phase !== "MEDIA_PUBLISH_CONFIRMED"
    || !lifecycle.providerContainerId
    || !lifecycle.providerPostId
    || !lifecycle.providerPermalink
    || !lifecycle.mediaPublishRequestSha256
  ) throw new Error("INSTAGRAM_CONFIRMED_RESULT_INVALID");
  await rpc(admin, "complete_social_publish_job", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    provider_request_id: null,
    provider_request_sha256: lifecycle.mediaPublishRequestSha256,
    requested_provider_publish_id: lifecycle.providerContainerId,
    requested_provider_post_id: lifecycle.providerPostId,
    requested_provider_url: lifecycle.providerPermalink,
    provider_payload: {
      schema: "instagram-login-reels-publish-v25.0-2026-08-21",
      lifecycle_phase: lifecycle.phase,
      provider_container_id: lifecycle.providerContainerId,
      provider_post_id: lifecycle.providerPostId,
    },
  });
    return { status: "PUBLISHED" as const, postId: job.postId, remoteMutationAttempted: false };
}

async function recordOutcome(
  admin: AdminClient,
  job: InstagramPublishJob,
  lifecycle: InstagramLifecycle,
  outcome: "CONFIRMED" | "UNKNOWN" | "REJECTED_NO_SIDE_EFFECT",
  result: { mediaId: string; permalink: string } | null,
) {
  if (!lifecycle.mediaPublishOperationId) throw new Error("INSTAGRAM_MEDIA_OPERATION_MISSING");
  const payload = {
    schema: "instagram-media-publish-result-v1",
    content_fingerprint: job.contentFingerprint,
    caption_sha256: captionSha256(job),
  };
  return parseLifecycle(await rpc(admin, "record_instagram_media_publish_outcome_v1", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    requested_operation_id: lifecycle.mediaPublishOperationId,
    requested_outcome: outcome,
    requested_provider_request_id: null,
    requested_provider_post_id: result?.mediaId ?? null,
    requested_provider_permalink: result?.permalink ?? null,
    requested_event_idempotency_key: `instagram-media-result:${job.id}:${lifecycle.mediaPublishOperationId}:${outcome.toLowerCase()}`,
    requested_receipt_payload: payload,
  }));
}

async function reconcileMediaPublish(
  admin: AdminClient,
  readClient: InstagramReelsReadClient,
  job: InstagramPublishJob,
  lifecycle: InstagramLifecycle,
  accessToken: string,
  now: Date,
) {
  const duplicate = await duplicateLookup(readClient, job, accessToken);
  if (duplicate.status === "DUPLICATE" && duplicate.duplicate) {
    const confirmed = await recordOutcome(admin, job, lifecycle, "CONFIRMED", {
      mediaId: duplicate.duplicate.mediaId,
      permalink: duplicate.duplicate.permalink,
    });
    return completeConfirmed(admin, job, confirmed);
  }
  if (duplicate.status === "INCONCLUSIVE_PAGE_LIMIT") {
    return { status: "BLOCKED_RECONCILIATION_INCONCLUSIVE" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  if (lifecycle.phase === "MEDIA_PUBLISH_INTENT_RECORDED") {
    await recordOutcome(admin, job, lifecycle, "UNKNOWN", null);
  }
  if (
    duplicate.status === "CLEAR"
    && lifecycle.phase === "MEDIA_PUBLISH_OUTCOME_UNKNOWN"
    && now.getTime() >= Date.parse(job.publishNotAfter) + UNKNOWN_OUTCOME_RECONCILIATION_GRACE_MS
  ) {
    await recordOutcome(admin, job, lifecycle, "REJECTED_NO_SIDE_EFFECT", null);
    await failJob(admin, job, new Error("INSTAGRAM_REMOTE_PUBLISH_NOT_FOUND"), false);
    return { status: "FAILED_REMOTE_NOT_FOUND" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  return { status: "REMOTE_RESULT_UNCERTAIN" as const, postId: job.postId, remoteMutationAttempted: false };
}

async function beginAndPublish(
  admin: AdminClient,
  readClient: InstagramReelsReadClient,
  publishClient: InstagramReelsPublishClient,
  job: InstagramPublishJob,
  lifecycle: InstagramLifecycle,
  accessToken: string,
  now: Date,
) {
  if (!lifecycle.providerContainerId) throw new Error("INSTAGRAM_CONTAINER_ID_MISSING");
  const prepared = publishClient.preparePublishReel({
    accountId: job.accountId,
    containerId: lifecycle.providerContainerId,
  });
  lifecycle = parseLifecycle(await rpc(admin, "begin_instagram_media_publish_v1", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    requested_idempotency_key: `instagram-media-publish:${job.id}:${job.attempts}`,
    requested_request_sha256: prepared.requestSha256,
    requested_event_idempotency_key: `instagram-media-intent:${job.id}:${job.attempts}`,
    requested_receipt_payload: {
      schema: "instagram-media-publish-intent-v1",
      content_fingerprint: job.contentFingerprint,
      provider_container_id: lifecycle.providerContainerId,
    },
  }));
  if (!lifecycle.dispatchAllowed) {
    return reconcileMediaPublish(admin, readClient, job, lifecycle, accessToken, now);
  }
  try {
    const published = await publishClient.publishReel({
      accountId: job.accountId,
      containerId: lifecycle.providerContainerId!,
      accessToken,
    });
    if (published.requestSha256 !== prepared.requestSha256) {
      throw new Error("INSTAGRAM_MEDIA_REQUEST_HASH_MISMATCH");
    }
    const duplicate = await duplicateLookup(readClient, job, accessToken);
    if (
      duplicate.status === "DUPLICATE"
      && duplicate.duplicate
      && duplicate.duplicate.mediaId === published.mediaId
    ) {
      const confirmed = await recordOutcome(admin, job, lifecycle, "CONFIRMED", {
        mediaId: published.mediaId,
        permalink: duplicate.duplicate.permalink,
      });
      const completed = await completeConfirmed(admin, job, confirmed);
      return { ...completed, remoteMutationAttempted: true };
    }
    await recordOutcome(admin, job, lifecycle, "UNKNOWN", null);
    return { status: "REMOTE_RESULT_UNCERTAIN" as const, postId: job.postId, remoteMutationAttempted: true };
  } catch (error) {
    await recordOutcome(admin, job, lifecycle, "UNKNOWN", null);
    return {
      status: "REMOTE_RESULT_UNCERTAIN" as const,
      postId: job.postId,
      errorCode: safeErrorCode(error),
      remoteMutationAttempted: true,
    };
  }
}

async function pollContainer(
  admin: AdminClient,
  readClient: InstagramReelsReadClient,
  publishClient: InstagramReelsPublishClient,
  job: InstagramPublishJob,
  lifecycle: InstagramLifecycle,
  accessToken: string,
  now: Date,
) {
  if (!lifecycle.providerContainerId) throw new Error("INSTAGRAM_CONTAINER_ID_MISSING");
  const status = await readClient.fetchContainerStatus({
    accountId: job.accountId,
    containerId: lifecycle.providerContainerId,
  }, accessToken);
  if (status.statusCode === "PUBLISHED") {
    return { status: "BLOCKED_UNEXPECTED_CONTAINER_STATE" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  const nextPollAt = status.statusCode === "IN_PROGRESS"
    ? new Date(now.getTime() + 30_000).toISOString()
    : null;
  lifecycle = parseLifecycle(await rpc(admin, "record_instagram_container_status_v1", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    requested_operation_id: lifecycle.containerCreateOperationId,
    requested_provider_container_id: lifecycle.providerContainerId,
    requested_provider_status: status.statusCode,
    requested_provider_request_id: null,
    requested_event_idempotency_key: `instagram-container-poll:${job.id}:${lifecycle.containerCreateOperationId}:${lifecycle.pollCount + 1}`,
    requested_receipt_payload: {
      schema: "instagram-container-status-v1",
      content_fingerprint: job.contentFingerprint,
    },
    requested_next_poll_at: nextPollAt,
  }));
  if (lifecycle.phase === "CONTAINER_READY") {
    return beginAndPublish(admin, readClient, publishClient, job, lifecycle, accessToken, now);
  }
  if (lifecycle.phase === "CONTAINER_FAILED") {
    await failJob(admin, job, new Error("INSTAGRAM_CONTAINER_FAILED"), false);
    return { status: "FAILED_CONTAINER" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  return { status: "CONTAINER_PROCESSING" as const, postId: job.postId, remoteMutationAttempted: false };
}

async function createContainer(
  admin: AdminClient,
  readClient: InstagramReelsReadClient,
  publishClient: InstagramReelsPublishClient,
  job: InstagramPublishJob,
  videoUrl: string,
  accessToken: string,
  now: Date,
) {
  const prepared = publishClient.prepareCreateReelContainer({
    accountId: job.accountId,
    videoUrl,
    caption: job.caption,
  });
  let lifecycle = parseLifecycle(await rpc(admin, "begin_instagram_container_create_v1", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    requested_idempotency_key: `instagram-container-create:${job.id}:${job.attempts}`,
    requested_request_sha256: prepared.requestSha256,
    requested_event_idempotency_key: `instagram-container-intent:${job.id}:${job.attempts}`,
    requested_receipt_payload: {
      schema: "instagram-container-create-intent-v1",
      content_fingerprint: job.contentFingerprint,
      video_sha256: job.videoSha256,
      caption_sha256: captionSha256(job),
      share_to_feed: true,
      share_to_facebook: false,
    },
  }));
  if (!lifecycle.dispatchAllowed) {
    return { status: "BLOCKED_CONTAINER_CREATE_RECONCILIATION" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  try {
    const created = await publishClient.createReelContainer({
      accountId: job.accountId,
      videoUrl,
      caption: job.caption,
      accessToken,
    });
    if (created.requestSha256 !== prepared.requestSha256) {
      throw new Error("INSTAGRAM_CONTAINER_REQUEST_HASH_MISMATCH");
    }
    lifecycle = parseLifecycle(await rpc(admin, "record_instagram_container_created_v1", {
      requested_job_id: job.id,
      requested_claim_id: job.claimId,
      requested_operation_id: lifecycle.containerCreateOperationId,
      requested_provider_container_id: created.containerId,
      requested_provider_status: "IN_PROGRESS",
      requested_provider_request_id: null,
      requested_event_idempotency_key: `instagram-container-created:${job.id}:${job.attempts}`,
      requested_receipt_payload: {
        schema: "instagram-container-create-result-v1",
        content_fingerprint: job.contentFingerprint,
      },
      requested_next_poll_at: new Date(now.getTime() + 30_000).toISOString(),
    }));
    const polled = await pollContainer(admin, readClient, publishClient, job, lifecycle, accessToken, now);
    return { ...polled, remoteMutationAttempted: true };
  } catch (error) {
    return {
      status: "REMOTE_RESULT_UNCERTAIN" as const,
      postId: job.postId,
      errorCode: safeErrorCode(error),
      remoteMutationAttempted: true,
    };
  }
}

async function startNewJob(
  admin: AdminClient,
  readClient: InstagramReelsReadClient,
  publishClient: InstagramReelsPublishClient,
  job: InstagramPublishJob,
  accessToken: string,
  now: Date,
) {
  const failures = instagramPublishGateFailures(job, "claimed", now);
  if (failures.length) {
    await failJob(admin, job, new Error("POLICY_GATE_MISMATCH"), false);
    return { status: "BLOCKED_POLICY" as const, postId: job.postId, gates: failures, remoteMutationAttempted: false };
  }
  const media = await verifyAndSignInstagramStagedMedia(admin, job, now);
  const quota = await readClient.fetchContentPublishingLimit({ accountId: job.accountId }, accessToken);
  if (quota.status !== "AVAILABLE") throw new Error("INSTAGRAM_PUBLISH_QUOTA_EXHAUSTED");
  const duplicate = await duplicateLookup(readClient, job, accessToken);
  const duplicatePayload = {
    schema: "instagram-owned-media-duplicate-v1",
    status: duplicate.status,
    scanned_count: duplicate.scannedCount,
    caption_sha256: captionSha256(job),
    duplicate_media_id: duplicate.duplicate?.mediaId ?? null,
    duplicate_permalink: duplicate.duplicate?.permalink ?? null,
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
    schema: "instagram-staged-media-qa-v1",
    content_fingerprint: job.contentFingerprint,
    video_sha256: media.video.sha256,
    cover_sha256: media.cover?.sha256 ?? null,
    video_size_bytes: media.video.sizeBytes,
    cover_size_bytes: media.cover?.sizeBytes ?? null,
    signed_url_expires_at: media.expiresAt,
  };
  const authorized = parseInstagramPublishJob(await rpc(admin, "authorize_social_publish_job", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    observed_video_sha256: media.video.sha256,
    observed_content_fingerprint: job.contentFingerprint,
    qa_receipt_sha256: sha256Json(qaReceipt),
    remote_duplicate_receipt_sha256: duplicateReceiptSha256,
    preflight_payload: { qa: qaReceipt, duplicate: duplicatePayload, quota },
  }));
  const publishingFailures = instagramPublishGateFailures(authorized, "publishing", now);
  if (publishingFailures.length) throw new Error("POLICY_GATE_MISMATCH");
  return createContainer(
    admin,
    readClient,
    publishClient,
    authorized,
    media.video.signedUrl,
    accessToken,
    now,
  );
}

async function resumeJob(
  admin: AdminClient,
  readClient: InstagramReelsReadClient,
  publishClient: InstagramReelsPublishClient,
  job: InstagramPublishJob,
  lifecycle: InstagramLifecycle,
  accessToken: string,
  now: Date,
) {
  switch (lifecycle.phase) {
    case "CREATE_INTENT_RECORDED":
      return { status: "BLOCKED_CONTAINER_CREATE_RECONCILIATION" as const, postId: job.postId, remoteMutationAttempted: false };
    case "CONTAINER_PROCESSING":
      return pollContainer(admin, readClient, publishClient, job, lifecycle, accessToken, now);
    case "CONTAINER_READY":
      return beginAndPublish(admin, readClient, publishClient, job, lifecycle, accessToken, now);
    case "CONTAINER_FAILED":
      await failJob(admin, job, new Error("INSTAGRAM_CONTAINER_FAILED"), false);
      return { status: "FAILED_CONTAINER" as const, postId: job.postId, remoteMutationAttempted: false };
    case "MEDIA_PUBLISH_INTENT_RECORDED":
    case "MEDIA_PUBLISH_OUTCOME_UNKNOWN":
      return reconcileMediaPublish(admin, readClient, job, lifecycle, accessToken, now);
    case "MEDIA_PUBLISH_CONFIRMED":
      return completeConfirmed(admin, job, lifecycle);
    case "MEDIA_PUBLISH_REJECTED":
      await failJob(admin, job, new Error("INSTAGRAM_MEDIA_PUBLISH_REJECTED"), false);
      return { status: "FAILED_MEDIA_PUBLISH" as const, postId: job.postId, remoteMutationAttempted: false };
  }
}

export async function runInstagramPublishWorker(options: WorkerOptions = {}) {
  if (!socialPublishingEnabled() || !instagramPublishingEnabled()) {
    return { status: "DISABLED" as const, externalActionsPerformed: false, result: null };
  }
  const admin = options.admin ?? createAdminClient() as AdminClient;
  if (!admin) {
    return { status: "BLOCKED_DATABASE_UNAVAILABLE" as const, externalActionsPerformed: false, result: null };
  }
  const now = options.now ?? new Date();
  try {
    const connection = options.connection ?? await loadInstagramPublishingConnection(now);
    const readClient = options.readClient ?? new InstagramReelsReadClient({
      activation: instagramReadActivation(connection),
      networkEnabled: true,
    });
    const publishClient = options.publishClient ?? new InstagramReelsPublishClient({
      activation: instagramPublishActivation(connection),
      networkEnabled: true,
      publishingEnabled: true,
    });
    const resumedRaw = await rpc(admin, "claim_due_instagram_publish_work_v1");
    if (resumedRaw !== null) {
      const row = object(resumedRaw);
      const job = parseInstagramPublishJob(row);
      const lifecycle = parseLifecycle(row?.instagram_lifecycle);
      const result = await resumeJob(
        admin,
        readClient,
        publishClient,
        job,
        lifecycle,
        connection.accessToken,
        now,
      );
      return { status: "COMPLETE" as const, externalActionsPerformed: result.remoteMutationAttempted, result };
    }
    const claimedRaw = await rpc(admin, "claim_due_social_publish_job", {
      requested_provider: "instagram",
      requested_worker_window_minutes: 5,
    });
    if (claimedRaw === null) {
      return { status: "IDLE" as const, externalActionsPerformed: false, result: null };
    }
    const job = parseInstagramPublishJob(claimedRaw);
    try {
      const result = await startNewJob(
        admin,
        readClient,
        publishClient,
        job,
        connection.accessToken,
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
