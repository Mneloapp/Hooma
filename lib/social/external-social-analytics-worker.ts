import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  facebookInsightsEnabled,
  youtubeInsightsEnabled,
  type SocialProvider,
} from "./config";
import {
  loadFacebookPublishingConnection,
  loadYouTubePublishingConnection,
} from "./connections";
import { FacebookReelsClient, FacebookReelsError } from "./providers/facebook-reels";
import { YouTubeShortsClient, YouTubeShortsError } from "./providers/youtube-shorts";
import { ensureYouTubePublishingConnection } from "./youtube-connection-maintenance";

type ExternalProvider = Extract<SocialProvider, "facebook" | "youtube">;
type JsonObject = Record<string, unknown>;
type Connection = Awaited<ReturnType<typeof loadFacebookPublishingConnection>>
  | Awaited<ReturnType<typeof loadYouTubePublishingConnection>>;
type AdminClient = ReturnType<typeof createAdminClient> & {
  rpc(name: string, args?: JsonObject): Promise<{ data: unknown; error: { code?: string } | null }>;
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function parseClaim(provider: ExternalProvider, value: unknown) {
  const row = object(value);
  const jobId = typeof row?.job_id === "string" ? row.job_id : "";
  const accountId = typeof row?.account_id === "string" ? row.account_id : "";
  const postId = typeof row?.post_id === "string" ? row.post_id : "";
  const horizon = row?.horizon;
  if (
    row?.provider !== provider
    || !/^[0-9a-f-]{36}$/i.test(jobId)
    || (provider === "facebook"
      ? !/^[1-9][0-9]{0,255}$/.test(accountId) || !/^[1-9][0-9]{0,255}$/.test(postId)
      : !/^UC[A-Za-z0-9_-]{22}$/.test(accountId) || !/^[A-Za-z0-9_-]{11}$/.test(postId))
    || (horizon !== "T2H" && horizon !== "T24H" && horizon !== "T72H")
  ) throw new Error("EXTERNAL_ANALYTICS_CLAIM_INVALID");
  return { jobId, accountId, postId, horizon };
}

async function rpc(admin: AdminClient, name: string, args: JsonObject = {}) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`SOCIAL_DATABASE_RPC_FAILED:${error.code ?? "UNKNOWN"}`);
  return data;
}

function safeError(error: unknown) {
  if (error instanceof FacebookReelsError || error instanceof YouTubeShortsError) {
    return error.code;
  }
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return /^[A-Z0-9_]{3,80}$/.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

export async function runExternalSocialAnalyticsWorker(
  provider: ExternalProvider,
  options: {
    admin?: AdminClient;
    now?: Date;
    connection?: Connection;
    facebookClient?: FacebookReelsClient;
    youtubeClient?: YouTubeShortsClient;
  } = {},
) {
  const enabled = provider === "facebook"
    ? facebookInsightsEnabled()
    : youtubeInsightsEnabled();
  if (!enabled) return { status: "DISABLED" as const, externalActionsPerformed: false, result: null };
  const admin = options.admin ?? createAdminClient() as AdminClient;
  if (!admin) return { status: "BLOCKED_DATABASE_UNAVAILABLE" as const, externalActionsPerformed: false, result: null };
  try {
    const now = options.now ?? new Date();
    const connection = options.connection ?? (provider === "facebook"
      ? await loadFacebookPublishingConnection(now)
      : await ensureYouTubePublishingConnection(now));
    if (connection.provider !== provider) throw new Error("EXTERNAL_CONNECTION_PROVIDER_MISMATCH");
    const rawClaim = await rpc(admin, "claim_due_external_social_analytics_v1", {
      requested_provider: provider,
    });
    if (rawClaim === null) return { status: "IDLE" as const, externalActionsPerformed: false, result: null };
    const claim = parseClaim(provider, rawClaim);
    if (claim.accountId !== connection.externalAccountId) {
      throw new Error("EXTERNAL_ANALYTICS_ACCOUNT_MISMATCH");
    }
    let metrics: {
      views: number | null;
      likes: number | null;
      comments: number | null;
      shares: number | null;
      reach: number | null;
      favorites: number | null;
    };
    if (provider === "facebook") {
      const client = options.facebookClient ?? new FacebookReelsClient();
      const snapshot = await client.fetchMetrics({
        videoId: claim.postId,
        accessToken: connection.accessToken,
      });
      metrics = { ...snapshot, favorites: null };
    } else {
      const client = options.youtubeClient ?? new YouTubeShortsClient();
      const snapshot = await client.fetchMetrics({
        videoId: claim.postId,
        accessToken: connection.accessToken,
      });
      metrics = { ...snapshot, shares: null, reach: null };
    }
    await rpc(admin, "record_external_social_analytics_snapshot_v1", {
      requested_provider: provider,
      requested_job_id: claim.jobId,
      requested_post_id: claim.postId,
      requested_horizon: claim.horizon,
      requested_captured_at: now.toISOString(),
      requested_metrics: metrics,
    });
    return {
      status: "COMPLETE" as const,
      externalActionsPerformed: false,
      result: { jobId: claim.jobId, horizon: claim.horizon },
    };
  } catch (error) {
    return {
      status: "FAILED_CLOSED" as const,
      externalActionsPerformed: false,
      result: { errorCode: safeError(error) },
    };
  }
}

export function runFacebookAnalyticsWorker(options: Parameters<typeof runExternalSocialAnalyticsWorker>[1] = {}) {
  return runExternalSocialAnalyticsWorker("facebook", options);
}

export function runYouTubeAnalyticsWorker(options: Parameters<typeof runExternalSocialAnalyticsWorker>[1] = {}) {
  return runExternalSocialAnalyticsWorker("youtube", options);
}
