import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { instagramInsightsEnabled } from "./config";
import { loadInstagramPublishingConnection } from "./connections";
import { instagramReadActivation } from "./instagram-activation";
import { InstagramReelsReadClient } from "./providers/instagram-reels-read";

type JsonObject = Record<string, unknown>;
type AdminClient = ReturnType<typeof createAdminClient> & {
  rpc(name: string, args?: JsonObject): Promise<{ data: unknown; error: { code?: string } | null }>;
};

function object(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : null;
}

function parseClaim(value: unknown) {
  const row = object(value);
  const jobId = typeof row?.job_id === "string" ? row.job_id : "";
  const accountId = typeof row?.account_id === "string" ? row.account_id : "";
  const mediaId = typeof row?.media_id === "string" ? row.media_id : "";
  const horizon = row?.horizon;
  if (
    !/^[0-9a-f-]{36}$/i.test(jobId)
    || !/^[1-9]\d{0,255}$/.test(accountId)
    || !/^[1-9]\d{0,255}$/.test(mediaId)
    || (horizon !== "T2H" && horizon !== "T24H" && horizon !== "T72H")
  ) throw new Error("INSTAGRAM_ANALYTICS_CLAIM_INVALID");
  return { jobId, accountId, mediaId, horizon };
}

async function rpc(admin: AdminClient, name: string, args: JsonObject = {}) {
  const { data, error } = await admin.rpc(name, args);
  if (error) throw new Error(`SOCIAL_DATABASE_RPC_FAILED:${error.code ?? "UNKNOWN"}`);
  return data;
}

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message.split(":", 1)[0] : "UNEXPECTED_FAILURE";
  return /^[A-Z0-9_]{3,80}$/.test(raw) ? raw : "UNEXPECTED_FAILURE";
}

export async function runInstagramAnalyticsWorker(options: {
  admin?: AdminClient;
  now?: Date;
  connection?: Awaited<ReturnType<typeof loadInstagramPublishingConnection>>;
  readClient?: InstagramReelsReadClient;
} = {}) {
  if (!instagramInsightsEnabled()) {
    return { status: "DISABLED" as const, externalActionsPerformed: false, result: null };
  }
  const admin = options.admin ?? createAdminClient() as AdminClient;
  if (!admin) return { status: "BLOCKED_DATABASE_UNAVAILABLE" as const, externalActionsPerformed: false, result: null };
  try {
    const now = options.now ?? new Date();
    const connection = options.connection ?? await loadInstagramPublishingConnection(now);
    const readClient = options.readClient ?? new InstagramReelsReadClient({
      activation: instagramReadActivation(connection),
      networkEnabled: true,
      insightsEnabled: true,
    });
    const rawClaim = await rpc(admin, "claim_due_instagram_analytics_v1");
    if (rawClaim === null) return { status: "IDLE" as const, externalActionsPerformed: false, result: null };
    const claim = parseClaim(rawClaim);
    if (claim.accountId !== connection.externalAccountId) {
      throw new Error("INSTAGRAM_ANALYTICS_ACCOUNT_MISMATCH");
    }
    const snapshot = await readClient.fetchMediaInsights({
      accountId: claim.accountId,
      mediaId: claim.mediaId,
    }, connection.accessToken);
    const metrics = {
      views: snapshot.metrics.views,
      reach: snapshot.metrics.reach,
      likes: snapshot.metrics.likes,
      comments: snapshot.metrics.comments,
      shares: snapshot.metrics.shares,
      saved: snapshot.metrics.saved,
      total_interactions: snapshot.metrics.totalInteractions,
      follows: snapshot.metrics.follows,
      reels_video_view_total_time: snapshot.metrics.reelsVideoViewTotalTime,
      reels_average_watch_time: snapshot.metrics.reelsAverageWatchTime,
      clips_replays_count: snapshot.metrics.clipsReplaysCount,
      reels_aggregated_all_plays_count: snapshot.metrics.reelsAggregatedAllPlaysCount,
    };
    await rpc(admin, "record_instagram_analytics_snapshot_v1", {
      requested_job_id: claim.jobId,
      requested_media_id: claim.mediaId,
      requested_horizon: claim.horizon,
      requested_captured_at: now.toISOString(),
      requested_metrics: metrics,
    });
    return {
      status: "COMPLETE" as const,
      externalActionsPerformed: false,
      result: { jobId: claim.jobId, horizon: claim.horizon, availability: snapshot.status },
    };
  } catch (error) {
    return {
      status: "FAILED_CLOSED" as const,
      externalActionsPerformed: false,
      result: { errorCode: safeError(error) },
    };
  }
}
