import "server-only";

import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  facebookPublishingEnabled,
  socialPublishingEnabled,
  youtubePublishingEnabled,
  type SocialProvider,
} from "./config";
import {
  loadFacebookPublishingConnection,
} from "./connections";
import { loadYouTubePublishingConnection } from "./connections";
import {
  facebookPublishGateFailures,
  isSocialSha256,
  parseFacebookPublishJob,
  parseYouTubePublishJob,
  youtubePublishGateFailures,
  type FacebookPublishJob,
  type YouTubePublishJob,
} from "./publish-job";
import {
  FacebookReelsClient,
  FacebookReelsError,
  facebookCaptionSha256,
} from "./providers/facebook-reels";
import {
  YouTubeShortsClient,
  YouTubeShortsError,
  youtubeDescriptionSha256,
} from "./providers/youtube-shorts";
import {
  verifyAndSignFacebookStagedMedia,
  verifyAndSignYouTubeStagedMedia,
  type VerifiedSocialStagedMedia,
} from "./staging";
import { ensureYouTubePublishingConnection } from "./youtube-connection-maintenance";

type ExternalProvider = Extract<SocialProvider, "facebook" | "youtube">;
type ExternalJob = FacebookPublishJob | YouTubePublishJob;
type JsonObject = Record<string, unknown>;
type Connection = Awaited<ReturnType<typeof loadFacebookPublishingConnection>>
  | Awaited<ReturnType<typeof loadYouTubePublishingConnection>>;

type Lifecycle = {
  jobId: string;
  provider: ExternalProvider;
  phase: "PUBLISH_INTENT_RECORDED" | "PROCESSING_REMOTE" | "PUBLISHED" | "FAILED";
  publishOperationId: string;
  publishRequestSha256: string;
  providerPublishId: string | null;
  providerStatus: string | null;
  providerPostId: string | null;
  providerUrl: string | null;
  failureReason: string | null;
  pollCount: number;
  dispatchAllowed: boolean;
};

type AdminClient = ReturnType<typeof createAdminClient> & {
  rpc(name: string, args?: JsonObject): Promise<{ data: unknown; error: { code?: string } | null }>;
};

type WorkerOptions = {
  admin?: AdminClient;
  now?: Date;
  connection?: Connection;
  facebookClient?: FacebookReelsClient;
  youtubeClient?: YouTubeShortsClient;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_ERROR = /^[A-Z0-9_]{3,80}$/;
const RECONCILIATION_GRACE_MS = 15 * 60 * 1_000;

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

function safeErrorCode(error: unknown) {
  if (error instanceof FacebookReelsError || error instanceof YouTubeShortsError) {
    return error.code;
  }
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return SAFE_ERROR.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

function parseLifecycle(value: unknown, expectedProvider: ExternalProvider): Lifecycle {
  const row = object(value);
  const phase = text(row?.phase) as Lifecycle["phase"];
  const phases = new Set<Lifecycle["phase"]>([
    "PUBLISH_INTENT_RECORDED", "PROCESSING_REMOTE", "PUBLISHED", "FAILED",
  ]);
  const lifecycle: Lifecycle = {
    jobId: text(row?.job_id),
    provider: text(row?.provider) as ExternalProvider,
    phase,
    publishOperationId: text(row?.publish_operation_id),
    publishRequestSha256: text(row?.publish_request_sha256),
    providerPublishId: nullableText(row?.provider_publish_id),
    providerStatus: nullableText(row?.provider_status),
    providerPostId: nullableText(row?.provider_post_id),
    providerUrl: nullableText(row?.provider_url),
    failureReason: nullableText(row?.failure_reason),
    pollCount: Number(row?.poll_count),
    dispatchAllowed: row?.dispatch_allowed === true,
  };
  const validProviderId = lifecycle.providerPublishId === null
    || (expectedProvider === "facebook"
      ? /^[1-9][0-9]{0,255}$/.test(lifecycle.providerPublishId)
      : /^[A-Za-z0-9_-]{11}$/.test(lifecycle.providerPublishId));
  if (
    !UUID.test(lifecycle.jobId)
    || lifecycle.provider !== expectedProvider
    || !phases.has(lifecycle.phase)
    || !UUID.test(lifecycle.publishOperationId)
    || !isSocialSha256(lifecycle.publishRequestSha256)
    || !validProviderId
    || !Number.isInteger(lifecycle.pollCount)
    || lifecycle.pollCount < 0
  ) throw new Error("EXTERNAL_LIFECYCLE_INVALID");
  return lifecycle;
}

async function rpc(admin: AdminClient, name: string, args: JsonObject = {}) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`SOCIAL_DATABASE_RPC_FAILED:${error.code ?? "UNKNOWN"}`);
  return data;
}

function parseJob(provider: ExternalProvider, value: unknown) {
  return provider === "facebook"
    ? parseFacebookPublishJob(value)
    : parseYouTubePublishJob(value);
}

function gateFailures(provider: ExternalProvider, job: ExternalJob, state: "claimed" | "publishing", now: Date) {
  return provider === "facebook"
    ? facebookPublishGateFailures(job as FacebookPublishJob, state, now)
    : youtubePublishGateFailures(job as YouTubePublishJob, state, now);
}

function assertTechnicalQa(provider: ExternalProvider, job: ExternalJob) {
  const qa = object(job.settings.technicalQa);
  const duration = Number(qa?.durationSeconds);
  const maximumDuration = provider === "facebook" ? 60 : 180;
  if (
    qa?.status !== "PASS"
    || Number(qa.width) !== 1080
    || Number(qa.height) !== 1920
    || String(qa.videoCodec).toLowerCase() !== "h264"
    || Number(qa.cfrFps) !== 30
    || qa.pixelFormat !== "yuv420p"
    || !Number.isFinite(duration)
    || duration < 4
    || duration > maximumDuration
  ) throw new Error("EXTERNAL_TECHNICAL_QA_INVALID");
  return {
    status: "PASS",
    duration_seconds: duration,
    width: 1080,
    height: 1920,
    video_codec: "h264",
    cfr_fps: 30,
    pixel_format: "yuv420p",
  };
}

async function failJob(
  admin: AdminClient,
  job: ExternalJob,
  error: unknown,
  remoteSideEffectPossible: boolean,
) {
  const errorCode = safeErrorCode(error);
  await rpc(admin, "fail_social_publish_job", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    provider_request_id: null,
    requested_error_code: errorCode,
    provider_payload: { error_code: errorCode },
    remote_side_effect_possible: remoteSideEffectPossible,
    requested_retry_at: null,
  }).catch(() => undefined);
}

async function blockDuplicate(
  admin: AdminClient,
  job: ExternalJob,
  payload: JsonObject,
) {
  await rpc(admin, "block_social_publish_remote_duplicate", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    duplicate_receipt_sha256: sha256Json(payload),
    duplicate_payload: payload,
  });
}

async function duplicateLookup(
  provider: ExternalProvider,
  job: ExternalJob,
  accessToken: string,
  facebookClient: FacebookReelsClient,
  youtubeClient: YouTubeShortsClient,
) {
  const notBefore = new Date(Date.parse(job.scheduledAt) - 72 * 60 * 60 * 1_000).toISOString();
  if (provider === "facebook") {
    const result = await facebookClient.lookupOwnedDuplicate({
      pageId: job.accountId,
      captionSha256: facebookCaptionSha256(job.caption),
      notBefore,
      maxPages: 5,
    }, accessToken);
    return {
      status: result.status,
      checked: result.checked,
      mediaId: result.status === "DUPLICATE" ? result.mediaId : null,
      url: result.status === "DUPLICATE" ? result.permalink : null,
      captionSha256: facebookCaptionSha256(job.caption),
    };
  }
  const result = await youtubeClient.lookupOwnedDuplicate({
    channelId: job.accountId,
    descriptionSha256: youtubeDescriptionSha256(job.caption),
    notBefore,
    maxPages: 5,
  }, accessToken);
  return {
    status: result.status,
    checked: result.checked,
    mediaId: result.status === "DUPLICATE" ? result.videoId : null,
    url: result.status === "DUPLICATE" ? result.url : null,
    captionSha256: youtubeDescriptionSha256(job.caption),
  };
}

async function recordAccepted(
  admin: AdminClient,
  provider: ExternalProvider,
  job: ExternalJob,
  lifecycle: Lifecycle,
  providerPublishId: string,
  now: Date,
) {
  const responsePayload = {
    schema: `${provider}-publish-accepted-v1`,
    provider_publish_id: providerPublishId,
    content_fingerprint: job.contentFingerprint,
  };
  return parseLifecycle(await rpc(admin, "record_external_social_publish_accepted_v1", {
    requested_provider: provider,
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    requested_operation_id: lifecycle.publishOperationId,
    requested_provider_publish_id: providerPublishId,
    requested_provider_response_sha256: sha256Json(responsePayload),
    requested_event_idempotency_key: `${provider}-publish-accepted:${job.id}:${lifecycle.publishOperationId}`,
    requested_event_payload: responsePayload,
    requested_next_poll_at: new Date(now.getTime() + 30_000).toISOString(),
  }), provider);
}

async function recordStatus(
  admin: AdminClient,
  provider: ExternalProvider,
  job: ExternalJob,
  lifecycle: Lifecycle,
  input: {
    status: "PROCESSING_REMOTE" | "PUBLISHED" | "FAILED";
    providerPostId: string | null;
    providerUrl: string | null;
    failureReason: string | null;
  },
  now: Date,
) {
  const payload = {
    schema: `${provider}-publish-status-v1`,
    provider_status: input.status,
    provider_post_id: input.providerPostId,
    provider_url: input.providerUrl,
    failure_reason: input.failureReason,
    content_fingerprint: job.contentFingerprint,
  };
  return parseLifecycle(await rpc(admin, "record_external_social_publish_status_v1", {
    requested_provider: provider,
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    requested_operation_id: lifecycle.publishOperationId,
    requested_status: input.status,
    requested_provider_response_sha256: sha256Json(payload),
    requested_provider_post_id: input.providerPostId,
    requested_provider_url: input.providerUrl,
    requested_failure_reason: input.failureReason,
    requested_event_idempotency_key: `${provider}-publish-status:${job.id}:${lifecycle.publishOperationId}:${lifecycle.pollCount + 1}`,
    requested_event_payload: payload,
    requested_next_poll_at: input.status === "PROCESSING_REMOTE"
      ? new Date(now.getTime() + 60_000).toISOString()
      : null,
  }), provider);
}

async function completePublished(
  admin: AdminClient,
  job: ExternalJob,
  lifecycle: Lifecycle,
) {
  if (
    lifecycle.phase !== "PUBLISHED"
    || !lifecycle.providerPublishId
    || !lifecycle.providerPostId
    || !lifecycle.providerUrl
  ) throw new Error("EXTERNAL_PUBLISHED_RESULT_INVALID");
  await rpc(admin, "complete_social_publish_job", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    provider_request_id: null,
    provider_request_sha256: lifecycle.publishRequestSha256,
    requested_provider_publish_id: lifecycle.providerPublishId,
    requested_provider_post_id: lifecycle.providerPostId,
    requested_provider_url: lifecycle.providerUrl,
    provider_payload: {
      schema: `${lifecycle.provider}-publish-complete-v1`,
      lifecycle_phase: lifecycle.phase,
      provider_post_id: lifecycle.providerPostId,
    },
  });
  return { status: "PUBLISHED" as const, postId: job.postId, remoteMutationAttempted: false };
}

async function pollRemote(
  admin: AdminClient,
  provider: ExternalProvider,
  job: ExternalJob,
  lifecycle: Lifecycle,
  accessToken: string,
  facebookClient: FacebookReelsClient,
  youtubeClient: YouTubeShortsClient,
  now: Date,
) {
  if (!lifecycle.providerPublishId) throw new Error("EXTERNAL_PROVIDER_ID_MISSING");
  if (provider === "facebook") {
    const result = await facebookClient.fetchVideo({
      videoId: lifecycle.providerPublishId,
      accessToken,
    });
    const statuses = [
      result.videoStatus,
      result.uploadingStatus,
      result.processingStatus,
      result.publishingStatus,
    ].filter((status): status is string => Boolean(status));
    const failedStatus = statuses.find((status) => new Set(["ERROR", "FAILED", "EXPIRED"]).has(status));
    const publishedStatus = new Set(["READY", "PUBLISHED", "FINISHED", "COMPLETED", "COMPLETE"]);
    if (
      result.permalink
      && (publishedStatus.has(result.videoStatus) || publishedStatus.has(result.publishingStatus ?? ""))
    ) {
      const published = await recordStatus(admin, provider, job, lifecycle, {
        status: "PUBLISHED",
        providerPostId: result.videoId,
        providerUrl: result.permalink,
        failureReason: null,
      }, now);
      return completePublished(admin, job, published);
    }
    if (failedStatus) {
      const failed = await recordStatus(admin, provider, job, lifecycle, {
        status: "FAILED", providerPostId: null, providerUrl: null,
        failureReason: `FACEBOOK_${failedStatus}`.slice(0, 120),
      }, now);
      await failJob(admin, job, new Error(failed.failureReason ?? "FACEBOOK_REMOTE_FAILED"), false);
      return { status: "FAILED_REMOTE" as const, postId: job.postId, remoteMutationAttempted: false };
    }
  } else {
    const result = await youtubeClient.fetchVideo({
      videoId: lifecycle.providerPublishId,
      accessToken,
    });
    const processed = result.uploadStatus === "processed"
      && (!result.processingStatus || result.processingStatus === "succeeded")
      && result.privacyStatus === "public";
    if (processed) {
      const published = await recordStatus(admin, provider, job, lifecycle, {
        status: "PUBLISHED", providerPostId: result.videoId,
        providerUrl: result.url, failureReason: null,
      }, now);
      return completePublished(admin, job, published);
    }
    if (new Set(["failed", "rejected", "deleted"]).has(result.uploadStatus)) {
      const failureReason = `YOUTUBE_${(result.rejectionReason ?? result.uploadStatus).replace(/[^A-Za-z0-9_.:-]/g, "_").toUpperCase()}`.slice(0, 120);
      await recordStatus(admin, provider, job, lifecycle, {
        status: "FAILED", providerPostId: null, providerUrl: null, failureReason,
      }, now);
      await failJob(admin, job, new Error(failureReason), false);
      return { status: "FAILED_REMOTE" as const, postId: job.postId, remoteMutationAttempted: false };
    }
  }
  await recordStatus(admin, provider, job, lifecycle, {
    status: "PROCESSING_REMOTE", providerPostId: null, providerUrl: null, failureReason: null,
  }, now);
  return { status: "PROCESSING_REMOTE" as const, postId: job.postId, remoteMutationAttempted: false };
}

function youtubeTitle(job: ExternalJob) {
  const configured = typeof job.settings.youtubeTitle === "string"
    ? job.settings.youtubeTitle.trim()
    : "";
  const fallback = job.caption.split(/\r?\n/, 1)[0]?.trim() ?? "";
  const base = (configured || fallback || "Hooma პროდუქტი").slice(0, 91).trim();
  return /#shorts/i.test(base) ? base.slice(0, 100) : `${base} #Shorts`.slice(0, 100);
}

async function dispatchNew(
  admin: AdminClient,
  provider: ExternalProvider,
  job: ExternalJob,
  lifecycle: Lifecycle,
  media: VerifiedSocialStagedMedia,
  accessToken: string,
  facebookClient: FacebookReelsClient,
  youtubeClient: YouTubeShortsClient,
  now: Date,
) {
  if (!lifecycle.dispatchAllowed) {
    return { status: "REMOTE_RESULT_UNCERTAIN" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  try {
    if (provider === "facebook") {
      const started = await facebookClient.startUpload(job.accountId, accessToken);
      lifecycle = await recordAccepted(admin, provider, job, lifecycle, started.videoId, now);
      await facebookClient.uploadHostedVideo({
        uploadUrl: started.uploadUrl,
        videoUrl: media.video.signedUrl,
        accessToken,
      });
      await facebookClient.finishUpload({
        pageId: job.accountId,
        videoId: started.videoId,
        caption: job.caption,
        accessToken,
      });
    } else {
      const session = await youtubeClient.createResumableSession({
        accessToken,
        title: youtubeTitle(job),
        description: job.caption,
        sizeBytes: media.video.sizeBytes,
      });
      const uploaded = await youtubeClient.uploadFromSignedUrl({
        uploadUrl: session.uploadUrl,
        videoUrl: media.video.signedUrl,
        expectedSha256: job.videoSha256,
        expectedSizeBytes: media.video.sizeBytes,
      });
      lifecycle = await recordAccepted(admin, provider, job, lifecycle, uploaded.videoId, now);
    }
    const result = await pollRemote(
      admin, provider, job, lifecycle, accessToken, facebookClient, youtubeClient, now,
    );
    return { ...result, remoteMutationAttempted: true };
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
  provider: ExternalProvider,
  job: ExternalJob,
  accessToken: string,
  facebookClient: FacebookReelsClient,
  youtubeClient: YouTubeShortsClient,
  now: Date,
) {
  const failures = gateFailures(provider, job, "claimed", now);
  if (failures.length) {
    await failJob(admin, job, new Error("POLICY_GATE_MISMATCH"), false);
    return { status: "BLOCKED_POLICY" as const, postId: job.postId, gates: failures, remoteMutationAttempted: false };
  }
  if (job.musicMode !== "HOOMA_OWNED_MASTER") throw new Error("LICENSED_MASTER_REQUIRED");
  const technicalQa = assertTechnicalQa(provider, job);
  const media = provider === "facebook"
    ? await verifyAndSignFacebookStagedMedia(admin, job as FacebookPublishJob, now)
    : await verifyAndSignYouTubeStagedMedia(admin, job as YouTubePublishJob, now);
  const duplicate = await duplicateLookup(
    provider, job, accessToken, facebookClient, youtubeClient,
  );
  const duplicatePayload = {
    schema: `${provider}-owned-media-duplicate-v1`,
    status: duplicate.status,
    scanned_count: duplicate.checked,
    caption_sha256: duplicate.captionSha256,
    duplicate_media_id: duplicate.mediaId,
    duplicate_url: duplicate.url,
  };
  if (duplicate.status === "DUPLICATE") {
    await blockDuplicate(admin, job, duplicatePayload);
    return { status: "BLOCKED_REMOTE_DUPLICATE" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  if (duplicate.status !== "CLEAR") throw new Error("REMOTE_DUPLICATE_CHECK_INCONCLUSIVE");
  const qaReceipt = {
    schema: `${provider}-staged-media-qa-v1`,
    content_fingerprint: job.contentFingerprint,
    video_sha256: media.video.sha256,
    cover_sha256: media.cover?.sha256 ?? null,
    video_size_bytes: media.video.sizeBytes,
    cover_size_bytes: media.cover?.sizeBytes ?? null,
    signed_url_expires_at: media.expiresAt,
    technical_qa: technicalQa,
  };
  const authorized = parseJob(provider, await rpc(admin, "authorize_social_publish_job", {
    requested_job_id: job.id,
    requested_claim_id: job.claimId,
    observed_video_sha256: media.video.sha256,
    observed_content_fingerprint: job.contentFingerprint,
    qa_receipt_sha256: sha256Json(qaReceipt),
    remote_duplicate_receipt_sha256: sha256Json(duplicatePayload),
    preflight_payload: { qa: qaReceipt, duplicate: duplicatePayload },
  }));
  const publishingFailures = gateFailures(provider, authorized, "publishing", now);
  if (publishingFailures.length) throw new Error("POLICY_GATE_MISMATCH");
  const requestPayload = {
    schema: `${provider}-publish-request-v1`,
    account_id: authorized.accountId,
    content_fingerprint: authorized.contentFingerprint,
    video_sha256: authorized.videoSha256,
    caption_sha256: duplicate.captionSha256,
  };
  const lifecycle = parseLifecycle(await rpc(admin, "begin_external_social_publish_v1", {
    requested_provider: provider,
    requested_job_id: authorized.id,
    requested_claim_id: authorized.claimId,
    requested_idempotency_key: `${provider}-publish:${authorized.id}:${authorized.attempts}`,
    requested_request_sha256: sha256Json(requestPayload),
    requested_event_idempotency_key: `${provider}-publish-intent:${authorized.id}:${authorized.attempts}`,
    requested_receipt_payload: requestPayload,
  }), provider);
  return dispatchNew(
    admin, provider, authorized, lifecycle, media, accessToken,
    facebookClient, youtubeClient, now,
  );
}

async function resumeIntent(
  admin: AdminClient,
  provider: ExternalProvider,
  job: ExternalJob,
  lifecycle: Lifecycle,
  accessToken: string,
  facebookClient: FacebookReelsClient,
  youtubeClient: YouTubeShortsClient,
  now: Date,
) {
  const duplicate = await duplicateLookup(
    provider, job, accessToken, facebookClient, youtubeClient,
  );
  if (duplicate.status === "DUPLICATE" && duplicate.mediaId && duplicate.url) {
    lifecycle = await recordAccepted(admin, provider, job, lifecycle, duplicate.mediaId, now);
    const published = await recordStatus(admin, provider, job, lifecycle, {
      status: "PUBLISHED",
      providerPostId: duplicate.mediaId,
      providerUrl: duplicate.url,
      failureReason: null,
    }, now);
    return completePublished(admin, job, published);
  }
  if (duplicate.status === "INCONCLUSIVE_PAGE_LIMIT") {
    return { status: "BLOCKED_RECONCILIATION_INCONCLUSIVE" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  if (now.getTime() >= Date.parse(job.publishNotAfter) + RECONCILIATION_GRACE_MS) {
    await failJob(admin, job, new Error("REMOTE_RESULT_UNCERTAIN"), true);
    return { status: "REMOTE_RESULT_UNCERTAIN" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  return { status: "REMOTE_RESULT_UNCERTAIN" as const, postId: job.postId, remoteMutationAttempted: false };
}

async function resumeJob(
  admin: AdminClient,
  provider: ExternalProvider,
  job: ExternalJob,
  lifecycle: Lifecycle,
  accessToken: string,
  facebookClient: FacebookReelsClient,
  youtubeClient: YouTubeShortsClient,
  now: Date,
) {
  if (lifecycle.phase === "PUBLISHED") return completePublished(admin, job, lifecycle);
  if (lifecycle.phase === "FAILED") {
    await failJob(admin, job, new Error(lifecycle.failureReason ?? "REMOTE_PUBLISH_FAILED"), false);
    return { status: "FAILED_REMOTE" as const, postId: job.postId, remoteMutationAttempted: false };
  }
  if (lifecycle.phase === "PUBLISH_INTENT_RECORDED") {
    return resumeIntent(
      admin, provider, job, lifecycle, accessToken, facebookClient, youtubeClient, now,
    );
  }
  return pollRemote(
    admin, provider, job, lifecycle, accessToken, facebookClient, youtubeClient, now,
  );
}

export async function runExternalSocialPublishWorker(
  provider: ExternalProvider,
  options: WorkerOptions = {},
) {
  const enabled = provider === "facebook"
    ? facebookPublishingEnabled()
    : youtubePublishingEnabled();
  if (!socialPublishingEnabled() || !enabled) {
    return { status: "DISABLED" as const, externalActionsPerformed: false, result: null };
  }
  const admin = options.admin ?? createAdminClient() as AdminClient;
  if (!admin) return { status: "BLOCKED_DATABASE_UNAVAILABLE" as const, externalActionsPerformed: false, result: null };
  const now = options.now ?? new Date();
  try {
    const connection = options.connection ?? (provider === "facebook"
      ? await loadFacebookPublishingConnection(now)
      : await ensureYouTubePublishingConnection(now));
    if (connection.provider !== provider) throw new Error("EXTERNAL_CONNECTION_PROVIDER_MISMATCH");
    const facebookClient = options.facebookClient ?? new FacebookReelsClient();
    const youtubeClient = options.youtubeClient ?? new YouTubeShortsClient();
    const resumedRaw = await rpc(admin, "claim_due_external_social_publish_work_v1", {
      requested_provider: provider,
    });
    if (resumedRaw !== null) {
      const row = object(resumedRaw);
      const job = parseJob(provider, row);
      const lifecycle = parseLifecycle(row?.external_lifecycle, provider);
      const result = await resumeJob(
        admin, provider, job, lifecycle, connection.accessToken,
        facebookClient, youtubeClient, now,
      );
      return { status: "COMPLETE" as const, externalActionsPerformed: result.remoteMutationAttempted, result };
    }
    const claimedRaw = await rpc(admin, "claim_due_external_social_publish_job_v1", {
      requested_provider: provider,
      requested_worker_window_minutes: 5,
    });
    if (claimedRaw === null) return { status: "IDLE" as const, externalActionsPerformed: false, result: null };
    const job = parseJob(provider, claimedRaw);
    if (job.accountId !== connection.externalAccountId) throw new Error("EXTERNAL_JOB_ACCOUNT_MISMATCH");
    try {
      const result = await startNewJob(
        admin, provider, job, connection.accessToken,
        facebookClient, youtubeClient, now,
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

export function runFacebookPublishWorker(options: WorkerOptions = {}) {
  return runExternalSocialPublishWorker("facebook", options);
}

export function runYouTubePublishWorker(options: WorkerOptions = {}) {
  return runExternalSocialPublishWorker("youtube", options);
}
